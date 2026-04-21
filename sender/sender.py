import csv
import time
import requests
import sys
import os

CSV_FILE = os.environ.get('CSV_FILE', '/app/data/ip_addresses.csv')
SERVER_URL = os.environ.get('SERVER_URL', 'http://server:5000/api/packages')


def detect_delimiter(file_path):
    with open(file_path, 'r') as f:
        first_line = f.readline()
    if '|' in first_line:
        return '|'
    return ','


def wait_for_server(url, timeout=60):
    health_url = url.rsplit('/', 1)[0] + '/health'
    for i in range(timeout // 2):
        try:
            r = requests.get(health_url, timeout=2)
            if r.status_code == 200:
                print("Server is ready!")
                return True
        except requests.exceptions.RequestException:
            pass
        print(f"Waiting for server... ({i + 1})")
        time.sleep(2)
    return False


def main():
    speed_factor = float(sys.argv[1]) if len(sys.argv) > 1 else 10.0
    print(f"=== Traffic Sender ===")
    print(f"Speed factor: {speed_factor}x")
    print(f"CSV file: {CSV_FILE}")
    print(f"Server URL: {SERVER_URL}")

    if not wait_for_server(SERVER_URL):
        print("ERROR: Server not reachable. Exiting.")
        sys.exit(1)

    delimiter = detect_delimiter(CSV_FILE)
    print(f"Detected delimiter: '{delimiter.strip()}'")

    rows = []
    with open(CSV_FILE, 'r') as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        for row in reader:
            clean = {}
            for k, v in row.items():
                clean[k.strip() if k else ''] = v.strip() if v else ''
            rows.append(clean)

    print(f"Loaded {len(rows)} packages")

    prev_timestamp = None
    sent_count = 0

    for i, row in enumerate(rows):
        try:
            ip = row.get('ip address', row.get('ip', row.get('ip_address', '')))
            lat = float(row.get('Latitude', row.get('latitude', row.get('lat', 0))))
            lon = float(row.get('Longitude', row.get('longitude', row.get('lon', 0))))
            ts = int(float(row.get('Timestamp', row.get('timestamp', row.get('time', 0)))))
            suspicious = int(float(row.get('suspicious', row.get('Suspicious', 0))))
        except (ValueError, TypeError) as e:
            print(f"Skipping row {i}: {e} — {row}")
            continue

        if prev_timestamp is not None:
            delay = (ts - prev_timestamp) / speed_factor
            if delay > 0:
                time.sleep(delay)
        prev_timestamp = ts

        package = {
            'ip': ip,
            'latitude': lat,
            'longitude': lon,
            'timestamp': ts,
            'suspicious': suspicious
        }

        try:
            resp = requests.post(SERVER_URL, json=package, timeout=5)
            sent_count += 1
            mark = '⚠️  SUSPICIOUS' if suspicious else '✓ normal'
            print(f"[{sent_count}/{len(rows)}] {ip} ({lat:+.2f}, {lon:+.2f}) {mark}")
        except requests.exceptions.RequestException as e:
            print(f"Failed to send: {e}")
            time.sleep(1)

    print(f"\nDone! Sent {sent_count} packages.")


if __name__ == '__main__':
    main()