#!/bin/bash

echo "=========================================="
echo "Testing KVCloud Admin Login"
echo "=========================================="
echo ""

echo "Credentials being tested:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""

echo "1. Testing login endpoint..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:8000/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✓ Login successful (HTTP $HTTP_CODE)"
    echo ""
    
    # Extract token
    TOKEN=$(echo "$BODY" | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
    
    if [ -n "$TOKEN" ]; then
        echo "2. Testing authenticated endpoint..."
        USER_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "http://localhost:8000/auth/me" \
          -H "Authorization: Bearer $TOKEN")
        
        USER_HTTP_CODE=$(echo "$USER_RESPONSE" | tail -n1)
        USER_BODY=$(echo "$USER_RESPONSE" | head -n-1)
        
        if [ "$USER_HTTP_CODE" -eq 200 ]; then
            echo "✓ User info retrieved successfully (HTTP $USER_HTTP_CODE)"
            echo ""
            echo "User Details:"
            echo "$USER_BODY" | python3 -m json.tool 2>/dev/null
            echo ""
            echo "=========================================="
            echo "✓ ALL TESTS PASSED"
            echo "=========================================="
            exit 0
        else
            echo "✗ Failed to retrieve user info (HTTP $USER_HTTP_CODE)"
            echo "$USER_BODY"
            exit 1
        fi
    else
        echo "✗ Failed to extract token from response"
        exit 1
    fi
else
    echo "✗ Login failed (HTTP $HTTP_CODE)"
    echo "Response: $BODY"
    exit 1
fi
