#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     FIX JARVIS AI - UPDATING DEPRECATED MODEL                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "The issue: Jarvis is trying to use 'gpt-5' which was deprecated!"
echo "The fix: Update to use 'gpt-3.5-turbo' instead"
echo ""

# First, test the API key with correct model
echo "1. Testing your API key with correct model..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

docker exec homelab-dashboard python -c "
import requests
import os

api_key = os.environ.get('OPENAI_API_KEY', '')
print(f'API Key found: {bool(api_key)}')

if api_key:
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    
    # Test with CORRECT model
    data = {
        'model': 'gpt-3.5-turbo',  # Working model!
        'messages': [{'role': 'user', 'content': 'Test'}],
        'max_tokens': 10
    }
    
    response = requests.post(
        'https://api.openai.com/v1/chat/completions',
        headers=headers,
        json=data
    )
    
    if response.status_code == 200:
        print('✅ API Key is VALID - OpenAI connection works!')
    else:
        print(f'❌ Error {response.status_code}: {response.text[:200]}')
"

echo ""
echo "2. Fixing the model in ai_service.py..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Fix the hardcoded model in the service
docker exec homelab-dashboard bash -c "
sed -i \"s/'gpt-5'/'gpt-3.5-turbo'/g\" /app/services/ai_service.py
sed -i 's/\"gpt-5\"/\"gpt-3.5-turbo\"/g' /app/services/ai_service.py
echo 'Fixed model references in ai_service.py'
"

echo ""
echo "3. Restarting the service..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

docker compose restart homelab-dashboard

echo ""
echo "✅ FIX APPLIED!"
echo ""
echo "Jarvis should now work at: https://host.evindrake.net"
echo "The 40% error should be gone!"