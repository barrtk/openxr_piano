import http.server
import socketserver
import os

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow cross-origin for WebXR testing if needed
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"--- VR Piano Bridge Active ---")
        print(f"Serving at: http://localhost:{PORT}")
        print(f"On your Quest, open: http://<YOUR_PC_IP>:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nBridge stopped.")
