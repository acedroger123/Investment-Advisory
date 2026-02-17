import subprocess
import time
import os
import http.client
import sys

def check_service(port):
    """Verifies if a service is responsive on its assigned port."""
    try:
        conn = http.client.HTTPConnection("localhost", port)
        conn.request("GET", "/")
        conn.getresponse()
        return True
    except:
        return False

def start_services():
    processes = []
    # Project service configuration matching your architecture
    commands = [
        {"name": "NODE_SERVER", "port": 3000, "cmd": ["node", "server.js"]},
        {"name": "STABILITY_API", "port": 8000, "cmd": ["uvicorn", "stablility_api:app", "--port", "8000"]},
        {"name": "RECOMMEND_API", "port": 8001, "cmd": ["uvicorn", "recommend_api:app", "--port", "8001"]},
        {"name": "GOAL_FEASIBILITY_API", "port": 8004, "cmd": ["uvicorn", "goal_api:app", "--port", "8004"]},
        {"name": "PORTFOLIO_ANALYSIS", "port": 8005, "cmd": ["uvicorn", "portfolio_app:app", "--port", "8005"]}
    ]

    print("🚀 Starting AI Wealth Ecosystem...")

    for service in commands:
        # text=False is mandatory to manually handle UTF-8 symbols like ₹ or emojis
        p = subprocess.Popen(
            service['cmd'], 
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT, 
            text=False, 
            shell=(os.name == 'nt') 
        )
        processes.append(p)
        print(f"⏳ Waiting for {service['name']} on port {service['port']}...")
        
        # Readiness check (gives ML models 30s to load from .joblib files)
        ready = False
        for _ in range(30): 
            if check_service(service['port']):
                ready = True
                break
            time.sleep(1)
        
        if ready: 
            print(f"✅ {service['name']} is UP.")
        else: 
            print(f"⚠️ {service['name']} timed out. It might still be loading ML models.")

    print("\n✅ All systems are online. Keep this window open.")
    print("--------------------------------------------------")
    return processes

if __name__ == "__main__":
    active_processes = []
    try:
        active_processes = start_services()
        
        # Binary logging loop to prevent UnicodeDecodeError (cp1252 crash)
        while True:
            # We stream logs from Node (processes[0]) as it's the main entry point
            line_bytes = active_processes[0].stdout.readline()
            
            if not line_bytes and active_processes[0].poll() is not None:
                break
                
            if line_bytes:
                # Use errors='replace' to handle characters Windows doesn't like
                line = line_bytes.decode('utf-8', errors='replace')
                print(f"[NODE] {line.strip()}")
                sys.stdout.flush() # Ensures logs appear immediately
                
    except KeyboardInterrupt:
        print("\n🛑 Shutting down AI Wealth Ecosystem...")
    except Exception as e:
        print(f"\n❌ Unexpected Crash: {e}")
    finally:
        # Crucial: Clean up all background processes so ports aren't blocked
        for p in active_processes:
            p.terminate()
        print("👋 Cleanup complete. All services stopped.")