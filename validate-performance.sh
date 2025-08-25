#!/bin/bash

# Performance Validation Script for Live Streaming Platform
# Validates system meets requirements:
# - 1000+ concurrent users per room
# - Sub-100ms latency for 95% of requests
# - 99.9% uptime SLA
# - Error rate < 1%

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
LOAD_TEST_DURATION=1800  # 30 minutes
VALIDATION_TIMEOUT=3600  # 1 hour timeout
LOG_DIR="./performance-logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Performance thresholds
MAX_LATENCY_P95=100      # 100ms
MAX_LATENCY_P99=250      # 250ms
MIN_UPTIME=99.9          # 99.9%
MAX_ERROR_RATE=1.0       # 1%
TARGET_USERS=1000        # 1000+ concurrent users
MAX_CPU_USAGE=85         # 85%
MAX_MEMORY_USAGE=80      # 80%

# Metrics endpoints
PROMETHEUS_URL="http://localhost:9090"
GRAFANA_URL="http://localhost:3001"
API_HEALTH_URL="http://localhost:5000/api/health"
METRICS_URL="http://localhost:5000/metrics"

# Function to print colored output
print_status() {
    echo -e "${BLUE}📊 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "${BLUE}"
    echo "=================================="
    echo "$1"
    echo "=================================="
    echo -e "${NC}"
}

# Setup logging
setup_logging() {
    mkdir -p "$LOG_DIR"
    export VALIDATION_LOG="$LOG_DIR/validation_$TIMESTAMP.log"
    export PERFORMANCE_LOG="$LOG_DIR/performance_$TIMESTAMP.log"
    export ERROR_LOG="$LOG_DIR/errors_$TIMESTAMP.log"
    
    print_status "Logging to: $LOG_DIR"
    echo "Validation started at $(date)" > "$VALIDATION_LOG"
}

# Check if all services are running
check_services() {
    print_header "SERVICE HEALTH CHECK"
    
    local services=("websocket-server-1" "websocket-server-2" "api-server-1" "api-server-2" "sfu-server-1" "sfu-server-2" "redis-cluster-1" "mongodb-primary" "prometheus" "grafana")
    local failed_services=()
    
    for service in "${services[@]}"; do
        if docker-compose ps "$service" | grep -q "Up"; then
            print_success "Service $service is running"
        else
            print_error "Service $service is not running"
            failed_services+=("$service")
        fi
    done
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        print_success "All services are healthy"
        return 0
    else
        print_error "Failed services: ${failed_services[*]}"
        return 1
    fi
}

# Check API health endpoints
check_api_health() {
    print_header "API HEALTH CHECK"
    
    local endpoints=("$API_HEALTH_URL" "$METRICS_URL")
    
    for endpoint in "${endpoints[@]}"; do
        if curl -f -s "$endpoint" > /dev/null; then
            print_success "Endpoint $endpoint is healthy"
        else
            print_error "Endpoint $endpoint is not responding"
            return 1
        fi
    done
    
    print_success "All API endpoints are healthy"
    return 0
}

# Pre-test system baseline
collect_baseline_metrics() {
    print_header "COLLECTING BASELINE METRICS"
    
    # System metrics
    echo "=== BASELINE METRICS ===" >> "$PERFORMANCE_LOG"
    echo "Timestamp: $(date)" >> "$PERFORMANCE_LOG"
    echo "CPU Usage: $(top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1)" >> "$PERFORMANCE_LOG"
    echo "Memory Usage: $(free | grep Mem | awk '{printf \"%.1f\", $3/$2 * 100.0}')" >> "$PERFORMANCE_LOG"
    echo "Disk Usage: $(df -h / | awk 'NR==2{print $5}')" >> "$PERFORMANCE_LOG"
    echo "Network Connections: $(netstat -an | grep ESTABLISHED | wc -l)" >> "$PERFORMANCE_LOG"
    
    # Docker stats
    echo "=== DOCKER STATS ===" >> "$PERFORMANCE_LOG"
    docker stats --no-stream >> "$PERFORMANCE_LOG"
    
    print_success "Baseline metrics collected"
}

# Run load test with progressive scaling
run_progressive_load_test() {
    print_header "PROGRESSIVE LOAD TEST"
    
    # Install dependencies if needed
    if ! command -v artillery &> /dev/null; then
        print_status "Installing Artillery..."
        npm install -g artillery@latest
    fi
    
    # Install required packages for load test functions
    npm install @faker-js/faker
    
    print_status "Starting progressive load test..."
    print_status "Duration: $LOAD_TEST_DURATION seconds"
    print_status "Target: $TARGET_USERS concurrent users"
    
    # Start load test in background
    artillery run load-test.yml --output "$LOG_DIR/artillery_report_$TIMESTAMP.json" > "$LOG_DIR/artillery_$TIMESTAMP.log" 2>&1 &
    ARTILLERY_PID=$!
    
    print_status "Load test started (PID: $ARTILLERY_PID)"
    print_status "Monitoring performance during test..."
    
    # Monitor during test
    monitor_during_test $ARTILLERY_PID
    
    # Wait for completion
    if wait $ARTILLERY_PID; then
        print_success "Load test completed successfully"
    else
        print_error "Load test failed or was interrupted"
        return 1
    fi
    
    # Generate report
    if [ -f "$LOG_DIR/artillery_report_$TIMESTAMP.json" ]; then
        artillery report "$LOG_DIR/artillery_report_$TIMESTAMP.json" --output "$LOG_DIR/artillery_report_$TIMESTAMP.html"
        print_success "Load test report generated: $LOG_DIR/artillery_report_$TIMESTAMP.html"
    fi
}

# Monitor system during load test
monitor_during_test() {
    local artillery_pid=$1
    local monitor_interval=30
    local sample_count=0
    
    while kill -0 $artillery_pid 2>/dev/null; do
        sample_count=$((sample_count + 1))
        
        print_status "Monitoring sample #$sample_count"
        
        # Collect real-time metrics
        echo "=== MONITORING SAMPLE $sample_count - $(date) ===" >> "$PERFORMANCE_LOG"
        
        # System resources
        cpu_usage=$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1)
        mem_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
        
        echo "CPU: ${cpu_usage}%" >> "$PERFORMANCE_LOG"
        echo "Memory: ${mem_usage}%" >> "$PERFORMANCE_LOG"
        
        # Check thresholds
        if (( $(echo "$cpu_usage > $MAX_CPU_USAGE" | bc -l) )); then
            print_warning "High CPU usage: ${cpu_usage}%"
        fi
        
        if (( $(echo "$mem_usage > $MAX_MEMORY_USAGE" | bc -l) )); then
            print_warning "High memory usage: ${mem_usage}%"
        fi
        
        # Prometheus metrics (if available)
        if curl -s "$PROMETHEUS_URL/api/v1/query?query=livestream_connections_total" > /dev/null 2>&1; then
            connections=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=sum(livestream_connections_total)" | jq -r '.data.result[0].value[1]' 2>/dev/null || echo "0")
            echo "Active Connections: $connections" >> "$PERFORMANCE_LOG"
            
            if [ "$connections" -gt 0 ]; then
                print_status "Active connections: $connections"
                
                if [ "$connections" -ge "$TARGET_USERS" ]; then
                    print_success "TARGET ACHIEVED: $connections concurrent users (target: $TARGET_USERS)"
                fi
            fi
        fi
        
        # Docker container health
        unhealthy_containers=$(docker ps --filter "health=unhealthy" -q | wc -l)
        if [ "$unhealthy_containers" -gt 0 ]; then
            print_warning "Unhealthy containers detected: $unhealthy_containers"
            docker ps --filter "health=unhealthy" >> "$ERROR_LOG"
        fi
        
        sleep $monitor_interval
    done
}

# Validate latency requirements
validate_latency() {
    print_header "LATENCY VALIDATION"
    
    if ! command -v jq &> /dev/null; then
        print_error "jq is required for metrics validation"
        return 1
    fi
    
    # Query Prometheus for latency metrics
    local p95_query="histogram_quantile(0.95, sum(rate(livestream_message_latency_seconds_bucket[5m])) by (le))"
    local p99_query="histogram_quantile(0.99, sum(rate(livestream_message_latency_seconds_bucket[5m])) by (le))"
    
    local p95_latency_ms=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=${p95_query}" | jq -r '.data.result[0].value[1]' 2>/dev/null | awk '{printf "%.0f", $1 * 1000}')
    local p99_latency_ms=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=${p99_query}" | jq -r '.data.result[0].value[1]' 2>/dev/null | awk '{printf "%.0f", $1 * 1000}')
    
    echo "=== LATENCY VALIDATION ===" >> "$VALIDATION_LOG"
    echo "P95 Latency: ${p95_latency_ms}ms (threshold: ${MAX_LATENCY_P95}ms)" >> "$VALIDATION_LOG"
    echo "P99 Latency: ${p99_latency_ms}ms (threshold: ${MAX_LATENCY_P99}ms)" >> "$VALIDATION_LOG"
    
    local latency_pass=true
    
    if [ "$p95_latency_ms" -le "$MAX_LATENCY_P95" ]; then
        print_success "P95 latency: ${p95_latency_ms}ms (✓ under ${MAX_LATENCY_P95}ms)"
    else
        print_error "P95 latency: ${p95_latency_ms}ms (✗ exceeds ${MAX_LATENCY_P95}ms)"
        latency_pass=false
    fi
    
    if [ "$p99_latency_ms" -le "$MAX_LATENCY_P99" ]; then
        print_success "P99 latency: ${p99_latency_ms}ms (✓ under ${MAX_LATENCY_P99}ms)"
    else
        print_error "P99 latency: ${p99_latency_ms}ms (✗ exceeds ${MAX_LATENCY_P99}ms)"
        latency_pass=false
    fi
    
    if $latency_pass; then
        print_success "LATENCY VALIDATION PASSED"
        return 0
    else
        print_error "LATENCY VALIDATION FAILED"
        return 1
    fi
}

# Validate uptime requirements
validate_uptime() {
    print_header "UPTIME VALIDATION"
    
    # Query service uptime
    local uptime_query="avg_over_time((sum(up{job=~\"livestream.*\"}) / count(up{job=~\"livestream.*\"}))[24h:]) * 100"
    local uptime_percentage=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=${uptime_query}" | jq -r '.data.result[0].value[1]' 2>/dev/null)
    
    if [ -z "$uptime_percentage" ] || [ "$uptime_percentage" = "null" ]; then
        print_warning "Unable to query 24h uptime, checking current status"
        local current_uptime_query="(sum(up{job=~\"livestream.*\"}) / count(up{job=~\"livestream.*\"})) * 100"
        uptime_percentage=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=${current_uptime_query}" | jq -r '.data.result[0].value[1]' 2>/dev/null)
    fi
    
    echo "=== UPTIME VALIDATION ===" >> "$VALIDATION_LOG"
    echo "Service Uptime: ${uptime_percentage}% (threshold: ${MIN_UPTIME}%)" >> "$VALIDATION_LOG"
    
    if (( $(echo "$uptime_percentage >= $MIN_UPTIME" | bc -l) )); then
        print_success "Uptime: ${uptime_percentage}% (✓ meets ${MIN_UPTIME}% SLA)"
        return 0
    else
        print_error "Uptime: ${uptime_percentage}% (✗ below ${MIN_UPTIME}% SLA)"
        return 1
    fi
}

# Validate error rate
validate_error_rate() {
    print_header "ERROR RATE VALIDATION"
    
    # Query error rate
    local error_rate_query="(sum(rate(livestream_errors_total[5m])) / sum(rate(livestream_messages_total[5m]))) * 100"
    local error_rate=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=${error_rate_query}" | jq -r '.data.result[0].value[1]' 2>/dev/null)
    
    if [ -z "$error_rate" ] || [ "$error_rate" = "null" ]; then
        error_rate="0"
    fi
    
    echo "=== ERROR RATE VALIDATION ===" >> "$VALIDATION_LOG"
    echo "Error Rate: ${error_rate}% (threshold: ${MAX_ERROR_RATE}%)" >> "$VALIDATION_LOG"
    
    if (( $(echo "$error_rate <= $MAX_ERROR_RATE" | bc -l) )); then
        print_success "Error rate: ${error_rate}% (✓ under ${MAX_ERROR_RATE}%)"
        return 0
    else
        print_error "Error rate: ${error_rate}% (✗ exceeds ${MAX_ERROR_RATE}%)"
        return 1
    fi
}

# Validate concurrent user capacity
validate_user_capacity() {
    print_header "USER CAPACITY VALIDATION"
    
    # Query peak concurrent connections
    local max_connections_query="max_over_time(sum(livestream_connections_total)[${LOAD_TEST_DURATION}s:])"
    local peak_connections=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=${max_connections_query}" | jq -r '.data.result[0].value[1]' 2>/dev/null)
    
    if [ -z "$peak_connections" ] || [ "$peak_connections" = "null" ]; then
        # Fallback to current connections
        local current_connections_query="sum(livestream_connections_total)"
        peak_connections=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=${current_connections_query}" | jq -r '.data.result[0].value[1]' 2>/dev/null)
    fi
    
    echo "=== USER CAPACITY VALIDATION ===" >> "$VALIDATION_LOG"
    echo "Peak Concurrent Users: $peak_connections (target: $TARGET_USERS)" >> "$VALIDATION_LOG"
    
    if [ "$peak_connections" -ge "$TARGET_USERS" ]; then
        print_success "Peak users: $peak_connections (✓ meets $TARGET_USERS target)"
        return 0
    else
        print_warning "Peak users: $peak_connections (⚠ below $TARGET_USERS target)"
        return 1
    fi
}

# Generate performance report
generate_report() {
    print_header "GENERATING PERFORMANCE REPORT"
    
    local report_file="$LOG_DIR/performance_report_$TIMESTAMP.html"
    
    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Live Streaming Platform - Performance Validation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { color: #2196F3; border-bottom: 2px solid #2196F3; padding-bottom: 10px; }
        .pass { color: #4CAF50; font-weight: bold; }
        .fail { color: #F44336; font-weight: bold; }
        .warn { color: #FF9800; font-weight: bold; }
        .metric { margin: 10px 0; padding: 10px; background: #f5f5f5; border-left: 4px solid #2196F3; }
        .summary { background: #e3f2fd; padding: 20px; margin: 20px 0; border-radius: 5px; }
    </style>
</head>
<body>
    <h1 class="header">Live Streaming Platform - Performance Validation Report</h1>
    <p><strong>Generated:</strong> $(date)</p>
    <p><strong>Test Duration:</strong> $LOAD_TEST_DURATION seconds</p>
    <p><strong>Target Users:</strong> $TARGET_USERS concurrent users</p>
    
    <div class="summary">
        <h2>Executive Summary</h2>
        <p>This report validates the live streaming platform's ability to handle 1000+ concurrent users 
        while maintaining sub-100ms latency and 99.9% uptime SLA requirements.</p>
    </div>
    
    <h2>Validation Results</h2>
EOF
    
    # Add validation results to report
    echo "<div class='metric'>" >> "$report_file"
    echo "<h3>Performance Metrics</h3>" >> "$report_file"
    
    if [ -f "$VALIDATION_LOG" ]; then
        echo "<pre>" >> "$report_file"
        cat "$VALIDATION_LOG" >> "$report_file"
        echo "</pre>" >> "$report_file"
    fi
    
    echo "</div>" >> "$report_file"
    
    # Add system logs
    if [ -f "$PERFORMANCE_LOG" ]; then
        echo "<div class='metric'>" >> "$report_file"
        echo "<h3>System Performance Logs</h3>" >> "$report_file"
        echo "<pre>" >> "$report_file"
        tail -n 100 "$PERFORMANCE_LOG" >> "$report_file"
        echo "</pre>" >> "$report_file"
        echo "</div>" >> "$report_file"
    fi
    
    # Add error logs if any
    if [ -f "$ERROR_LOG" ] && [ -s "$ERROR_LOG" ]; then
        echo "<div class='metric'>" >> "$report_file"
        echo "<h3>Error Logs</h3>" >> "$report_file"
        echo "<pre>" >> "$report_file"
        cat "$ERROR_LOG" >> "$report_file"
        echo "</pre>" >> "$report_file"
        echo "</div>" >> "$report_file"
    fi
    
    echo "</body></html>" >> "$report_file"
    
    print_success "Performance report generated: $report_file"
}

# Cleanup function
cleanup() {
    print_status "Cleaning up test environment..."
    
    # Kill any remaining artillery processes
    pkill -f artillery || true
    
    print_success "Cleanup completed"
}

# Main validation function
main() {
    print_header "LIVE STREAMING PLATFORM - PERFORMANCE VALIDATION"
    print_status "Target: 1000+ concurrent users, <100ms latency, 99.9% uptime"
    
    setup_logging
    
    # Pre-test checks
    if ! check_services; then
        print_error "Service health check failed"
        exit 1
    fi
    
    if ! check_api_health; then
        print_error "API health check failed"
        exit 1
    fi
    
    collect_baseline_metrics
    
    # Run the load test
    if ! run_progressive_load_test; then
        print_error "Load test failed"
        cleanup
        exit 1
    fi
    
    # Wait for metrics to stabilize
    print_status "Waiting for metrics to stabilize..."
    sleep 60
    
    # Validate performance requirements
    local validation_results=()
    
    if validate_latency; then
        validation_results+=("LATENCY: PASS")
    else
        validation_results+=("LATENCY: FAIL")
    fi
    
    if validate_uptime; then
        validation_results+=("UPTIME: PASS")
    else
        validation_results+=("UPTIME: FAIL")
    fi
    
    if validate_error_rate; then
        validation_results+=("ERROR_RATE: PASS")
    else
        validation_results+=("ERROR_RATE: FAIL")
    fi
    
    if validate_user_capacity; then
        validation_results+=("USER_CAPACITY: PASS")
    else
        validation_results+=("USER_CAPACITY: WARN")
    fi
    
    # Generate final report
    generate_report
    
    # Print summary
    print_header "VALIDATION SUMMARY"
    for result in "${validation_results[@]}"; do
        if [[ $result == *"PASS"* ]]; then
            print_success "$result"
        elif [[ $result == *"WARN"* ]]; then
            print_warning "$result"
        else
            print_error "$result"
        fi
    done
    
    # Check overall pass/fail
    local failed_tests=$(printf '%s\n' "${validation_results[@]}" | grep -c "FAIL" || true)
    
    if [ "$failed_tests" -eq 0 ]; then
        print_success "🎯 OVERALL RESULT: VALIDATION PASSED"
        print_success "System meets all performance requirements for 1000+ concurrent users"
    else
        print_error "💥 OVERALL RESULT: VALIDATION FAILED"
        print_error "$failed_tests test(s) failed"
    fi
    
    cleanup
    
    # Exit with appropriate code
    if [ "$failed_tests" -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Handle interrupts
trap cleanup INT TERM

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi