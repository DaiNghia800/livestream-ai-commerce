terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# ---------- ECR ----------
resource "aws_ecr_repository" "svc" {
  for_each             = toset(["commerce", "realtime"])
  name                 = "${var.name}/${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # demo: teardown khong bi chan boi image con lai

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "svc" {
  for_each   = aws_ecr_repository.svc
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last 5"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action       = { type = "expire" }
    }]
  })
}

# ---------- Secrets (SSM) ----------
resource "random_password" "secret_key" {
  length  = 48
  special = false
}

resource "random_password" "mock_gateway" {
  length  = 32
  special = false
}

resource "random_password" "mock_carrier" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "secret_key" {
  name  = "/${var.name}/commerce/SECRET_KEY"
  type  = "SecureString"
  value = random_password.secret_key.result
}

resource "aws_ssm_parameter" "mock_gateway" {
  name  = "/${var.name}/commerce/MOCK_GATEWAY_SECRET"
  type  = "SecureString"
  value = random_password.mock_gateway.result
}

resource "aws_ssm_parameter" "mock_carrier" {
  name  = "/${var.name}/commerce/MOCK_CARRIER_SECRET"
  type  = "SecureString"
  value = random_password.mock_carrier.result
}

# ---------- Execution role (dung chung 2 service) ----------
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    actions   = ["ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.region}:${var.account_id}:parameter/${var.name}/*"]
  }
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.db_secret_arn]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "read-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# ---------- Task role: realtime (khong can quyen AWS nao) ----------
resource "aws_iam_role" "realtime_task" {
  name               = "${var.name}-realtime-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# ---------- Task role: commerce ----------
resource "aws_iam_role" "commerce_task" {
  name               = "${var.name}-commerce-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# SQS/S3/IVS: cap o buoc 9-10 khi biet ARN. ECS Exec can ssmmessages.
data "aws_iam_policy_document" "exec_channel" {
  statement {
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "commerce_exec_channel" {
  name   = "ecs-exec"
  role   = aws_iam_role.commerce_task.id
  policy = data.aws_iam_policy_document.exec_channel.json
}

resource "aws_iam_role_policy" "realtime_exec_channel" {
  name   = "ecs-exec"
  role   = aws_iam_role.realtime_task.id
  policy = data.aws_iam_policy_document.exec_channel.json
}