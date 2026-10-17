process.env.RETURN_CORRECTIONS = "true";
process.env.QA_OUTPUT_DIR ||= "artifacts/qa/private-beta-candidate/return-corrections-browser";
require("./test-sale-return-workflow.cjs");
