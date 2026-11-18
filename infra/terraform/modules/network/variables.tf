variable "name" {
  type        = string
  description = "Tiền tố đặt tên tài nguyên"
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "azs" {
  type        = list(string)
  description = "Danh sách AZ, đúng 2 phần tử"
}

variable "enable_nat" {
  type    = bool
  default = true
}