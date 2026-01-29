import http.server
import socketserver
import time
import os

PORT = 8000

class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        # print(f"POST request to {self.path}")
        if self.path == '/log':
            try:
                content_length = int(self.headers['Content-Length'])
                message = self.rfile.read(content_length).decode('utf-8')
            
                timestamp = time.strftime("%H:%M:%S")
                prefix = "[QUEST]"
                if "ERR" in message.upper() or "CRASH" in message.upper() or "BŁĄD" in message.upper():
                    prefix = "[QUEST ERROR]"
                
                print(f"{timestamp} {prefix} {message}")
                
                self.send_response(204)
                self.end_headers()
            except Exception as e:
                print(f"Error processing log: {e}")
                self.send_response(500)
                self.end_headers()
        else:
            super().do_POST()

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    # socketserver.TCPServer.allow_reuse_address = True # Not needed with ThreadingHTTPServer usually, but good practice
    ThreadingHTTPServer.allow_reuse_address = True
    
    # Bind to 0.0.0.0 to allow LAN access
    with ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"--- VR Piano Bridge Active (Threaded) ---")
        print(f"Serving at: http://localhost:{PORT}")
        print(f"On your Quest, open: http://<YOUR_PC_IP>:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nBridge stopped.")
