terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  backend "s3" {
    bucket       = "liveorder-tfstate-553288148257"
    key          = "staging/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region              = "ap-southeast-1"
  allowed_account_ids = ["553288148257"]
  default_tags {
    tags = {
      Project   = "liveorder"
      Env       = "staging"
      ManagedBy = "terraform"
    }
  }
}

module "network" {
  source     = "../../modules/network"
  name       = "liveorder-staging"
  region     = "ap-southeast-1"
  azs        = ["ap-southeast-1a", "ap-southeast-1b"]
  enable_nat = false
}