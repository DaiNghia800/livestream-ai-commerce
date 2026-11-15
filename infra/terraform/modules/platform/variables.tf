variable "name" {
  type = string
}

variable "account_id" {
  type = string
}

variable "region" {
  type = string
}

variable "db_secret_arn" {
  type = string
}

variable "sqs_comments_arn" {
  type = string
}

variable "sqs_ai_results_arn" {
  type = string
}

variable "s3_images_arn" {
  type = string
}

variable "ivs_region" {
  type    = string
  default = "ap-northeast-1"
}