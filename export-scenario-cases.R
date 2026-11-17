# Numerical check only: supply the verified training median to the original predictor.
# This does not validate missing-SHR predictions in patients.
library(jsonlite)
source("../CKM_SHR_XGB9/app/predict_locked.R")
path <- "../CKM_SHR_XGB9/app/private/locked_xgboost9.rds"
stopifnot(unname(tools::md5sum(path)) == "b11f762732c4bd257915511652047f40")
f <- load_locked_model(path)
policy_text <- paste(readLines("shr-policy.js"),collapse="\n")
median_text <- sub(".*trainingMedian: ([^,]+),.*", "\\1", policy_text)
reference <- suppressWarnings(as.numeric(median_text))
stopifnot(length(reference)==1L, is.finite(reference), reference>0)
original <- fromJSON("reference-cases.json", simplifyVector=FALSE)
# Two profiles for every missingness pattern, plus higher/lower synthetic cases.
selected <- Filter(function(c) grepl("^expanded_missing_", c$id) ||
                     c$id %in% c("synthetic_higher_values", "synthetic_lower_values"), original)
checks <- lapply(selected, function(c) {
  values <- lapply(c$input, function(v) if(is.null(v)) NA_real_ else as.numeric(v))
  x <- as.data.frame(values, check.names=FALSE)[,f$variables,drop=FALSE]
  x$SHR <- reference
  expected <- predict_locked(x,f,calculator=FALSE)$predicted_risk
  x$SHR <- NA_real_
  list(id=paste0("shr_median_",c$id), input=as.list(x), expected=expected)
})
write_json(list(method="Original R predictor with SHR explicitly set to the training median; numerical agreement only, not clinical validation.",
                shr_training_median=reference, cases=checks),
           "scenario-reference-cases.json", auto_unbox=TRUE, digits=NA, na="null", pretty=TRUE)
cat("Exported",length(checks),"SHR median-scenario cases.\n")
