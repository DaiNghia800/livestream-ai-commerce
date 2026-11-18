output "db_address" {
  value = aws_db_instance.this.address
}

output "db_port" {
  value = aws_db_instance.this.port
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "db_username" {
  value = aws_db_instance.this.username
}

output "db_secret_arn" {
  value = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "redis_url" {
  value = "${var.redis_tls ? "rediss" : "redis"}://${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
}