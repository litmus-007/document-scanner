"""Simple local static server for the document scanner prototype."""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import argparse


def main() -> None:
    parser = argparse.ArgumentParser(description="Run local static server")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface")
    parser.add_argument("--port", type=int, default=8080, help="Port number")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), SimpleHTTPRequestHandler)
    print(f"Serving on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
