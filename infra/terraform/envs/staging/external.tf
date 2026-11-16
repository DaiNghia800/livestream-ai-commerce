# Tài nguyên TẠO TAY, ngoài Terraform (chỉ đọc)
data "aws_sqs_queue" "comments" { name = "liveorder-dev-realtime-comments" }
data "aws_sqs_queue" "ai_results" { name = "liveorder-dev-ai-worker-results" }
data "aws_s3_bucket" "images" { bucket = "liveorder-dev-realtime-images" }