#!/usr/bin/env python3
"""Quick database check script"""
import sqlite3

db_path = "/app/kvcloud.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("=== IP Addresses Table ===")
cursor.execute("SELECT id, ip_address, vm_id, hostname, pool_id, is_allocated FROM ip_addresses WHERE vm_id = 100")
rows = cursor.fetchall()
for row in rows:
    print(f"ID: {row[0]}, IP: {row[1]}, VM: {row[2]}, Hostname: {row[3]}, Pool: {row[4]}, Allocated: {row[5]}")

print("\n=== VM Network Config Table ===")
cursor.execute("SELECT * FROM vm_network_configs WHERE vm_id = 100")
rows = cursor.fetchall()
if not rows:
    print("No network config found for VM 100")
else:
    for row in rows:
        print(row)

conn.close()
