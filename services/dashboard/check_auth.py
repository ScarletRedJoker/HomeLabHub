#!/usr/bin/env python3
"""
Diagnostic script to check authentication credentials
Run inside the container: docker exec homelab-dashboard python check_auth.py
"""
import os

print("=" * 60)
print("Authentication Credentials Diagnostic")
print("=" * 60)

web_username = os.environ.get('WEB_USERNAME')
web_password = os.environ.get('WEB_PASSWORD')

print(f"WEB_USERNAME is set: {web_username is not None}")
print(f"WEB_PASSWORD is set: {web_password is not None}")

if web_username:
    print(f"WEB_USERNAME value: '{web_username}'")
    print(f"WEB_USERNAME length: {len(web_username)}")
    print(f"WEB_USERNAME repr: {repr(web_username)}")

if web_password:
    print(f"WEB_PASSWORD length: {len(web_password)}")
    print(f"WEB_PASSWORD starts with: '{web_password[:3]}...'")
    print(f"WEB_PASSWORD repr (first 10 chars): {repr(web_password[:10])}")
    
    # Check for special characters
    has_equals = '=' in web_password
    has_special = any(c in web_password for c in ['=', '@', '#', '$', '%', '^', '&', '*'])
    print(f"Contains '=' sign: {has_equals}")
    print(f"Contains special chars: {has_special}")

print("=" * 60)

# Test a login
print("\nTest authentication:")
test_user = input("Enter username to test: ")
test_pass = input("Enter password to test: ")

if test_user == web_username and test_pass == web_password:
    print("✓ AUTHENTICATION SUCCESSFUL!")
else:
    print("✗ Authentication failed")
    if test_user != web_username:
        print(f"  Username mismatch: got '{test_user}', expected '{web_username}'")
    if test_pass != web_password:
        print(f"  Password mismatch (lengths: got {len(test_pass)}, expected {len(web_password)})")
