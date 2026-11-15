# Run from this project: Rscript export-model.R
# R is needed only to re-export/verify, never to serve the website.
library(jsonlite)
source("../CKM_SHR_XGB9/app/predict_locked.R")
path <- "../CKM_SHR_XGB9/app/private/locked_xgboost9.rds"
stopifnot(unname(tools::md5sum(path)) == "b11f762732c4bd257915511652047f40")
f <- readRDS(path)
allowed <- c("bicarbonate_mEq.L_min", "resp_rate_mean", "mbp_mean")
systems <- lapply(f$imputer$systems, function(s) lapply(allowed, function(v) {
  b <- s[[v]]
  # No prediction ties: the random shuffle affects RNG advancement only.
  stopifnot(!anyDuplicated(b$donor_prediction))
  o <- order(b$donor_prediction)
  list(other=match(b$other,f$variables)-1L, mean=unname(b$mean),
       sd=unname(b$sd), beta=b$beta, prediction=b$donor_prediction[o], value=b$donor_value[o])
}))
# Every call is a single case with the original fixed seed. R's random draws
# depend on missingness pattern, never on input values. Export the exact ranks
# after advancing base::sample(n), as mice 3.18.0 matchindex does.
draws <- lapply(0:7, function(mask) {
  set.seed(20261113L)
  h <- integer()
  for(i in seq_len(20)) for(it in seq_len(10)) for(j in seq_along(allowed)) {
    if(bitwAnd(mask, bitwShiftL(1L,j-1L)) == 0) next
    n <- length(f$imputer$systems[[i]][[allowed[j]]]$donor_prediction)
    invisible(sample(n))
    h <- c(h, sample(seq_len(5), 1, replace=TRUE))
  }
  h
})
models <- lapply(f$models, function(z) {
  b <- structure(list(handle=xgboost::xgb.unserialize(z$fit)),class="xgb.Booster")
  tmp <- tempfile(fileext=".json")
  xgboost::xgb.save(b,tmp)
  raw <- fromJSON(tmp,simplifyVector=FALSE)$learner
  unlink(tmp)
  stopifnot(raw$objective$name == "binary:logistic")
  list(base_score=as.numeric(raw$learner_model_param$base_score),
       trees=lapply(raw$gradient_booster$model$trees,function(t) list(
         left=unlist(t$left_children),right=unlist(t$right_children),
         feature=unlist(t$split_indices),value=unlist(t$split_conditions))))
})
out <- list(id="CKM-SHR-XGB9-20261113", source_md5=unname(tools::md5sum(path)),
            variables=f$variables,missing_indices=match(allowed,f$variables)-1L,
            initial=unname(f$imputer$initial),systems=systems,draws=draws,
            iterations=10L,seed=20261113L,models=models)
writeLines(paste0("/* Generated from the locked model. Do not edit. */\nglobalThis.CKM_MODEL = ",
                 toJSON(out,auto_unbox=TRUE,digits=NA),";"),"model-data.js")
cases <- read.csv("../CKM_SHR_XGB9/verification/synthetic_cases.csv",check.names=FALSE)
checks <- lapply(seq_len(nrow(cases)),function(i)list(id=cases$case_id[i],
                 input=as.list(cases[i,f$variables]),expected=cases$expected_risk[i]))
set.seed(918)
for(i in 1:32) {
  x <- data.frame(bicarbonate_mEq.L_min=runif(1,8,36),resp_rate_mean=runif(1,10,40),
      stroke=as.numeric(i%%2),wbc=runif(1,1,35),bun_mg.dL_min=runif(1,0,130),
      af=as.numeric((i%/%2)%%2),mbp_mean=runif(1,45,125),age=runif(1,18,100),SHR=runif(1,.3,3),check.names=FALSE)
  mask <- i%%8
  for(j in seq_along(allowed))if(bitwAnd(mask,bitwShiftL(1L,j-1L))!=0)x[[allowed[j]]] <- NA_real_
  expected <- predict_locked(x,f,calculator=TRUE)$predicted_risk
  checks[[length(checks)+1L]] <- list(id=paste0("varied_",i),input=as.list(x),expected=expected)
}
# Check values on and either side of model split points (float32 conversion).
for(j in seq_along(f$variables)) {
  if(j %in% c(3,6)) next
  t <- models[[1]]$trees[[1]]
  candidates <- unlist(lapply(models[[1]]$trees,function(t)t$value[t$feature==(j-1L)&t$left>=0]))
  if(!length(candidates))next
  val <- candidates[1]
  for(delta in c(-1e-6,0,1e-6)) {
    x <- cases[1,f$variables]; x[[j]] <- val+delta
    checks[[length(checks)+1L]] <- list(id=paste0("boundary_",j,"_",delta),input=as.list(x),
                                      expected=predict_locked(x,f,calculator=TRUE)$predicted_risk)
  }
}
write_json(checks,"reference-cases.json",auto_unbox=TRUE,digits=NA,na="null",pretty=TRUE)
cat("Exported",length(models),"models and",length(checks),"reference cases.\n")
