resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name}-http"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.cors_origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["*"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_vpc_link" "this" {
  name               = "${var.name}-vpclink"
  subnet_ids         = var.app_subnet_ids
  security_group_ids = [var.vpclink_sg_id]
}

resource "aws_apigatewayv2_integration" "svc" {
  for_each           = var.cloudmap_service_arns
  api_id             = aws_apigatewayv2_api.this.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  integration_uri    = each.value
  connection_type    = "VPC_LINK"
  connection_id      = aws_apigatewayv2_vpc_link.this.id
}

resource "aws_apigatewayv2_route" "realtime" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "ANY /api/v1/realtime/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.svc["realtime"].id}"
}

resource "aws_apigatewayv2_route" "commerce" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "ANY /api/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.svc["commerce"].id}"
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.svc["commerce"].id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }
}