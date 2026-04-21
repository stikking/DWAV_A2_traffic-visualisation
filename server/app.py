from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from collections import Counter
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = 'traffic-viz-secret'

CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

packages = []
location_counts = Counter()
suspicious_total = 0
activity_log = []


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'}), 200


@app.route('/api/packages', methods=['POST'])
def receive_package():
    global suspicious_total

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No JSON body'}), 400

    packages.append(data)

    loc_key = f"{data['latitude']:.1f},{data['longitude']:.1f}"
    location_counts[loc_key] += 1

    if data.get('suspicious') == 1:
        suspicious_total += 1

    now = time.time()
    activity_log.append(now)
    while activity_log and activity_log[0] < now - 120:
        activity_log.pop(0)

    recent = sum(1 for t in activity_log if t > now - 5)
    rate = round(recent / 5, 1)

    top_locations = location_counts.most_common(10)

    socketio.emit('new_package', {
        'package': data,
        'stats': {
            'total_packages': len(packages),
            'suspicious_count': suspicious_total,
            'rate': rate,
            'unique_locations': len(location_counts),
        },
        'top_locations': [
            {'location': loc, 'count': cnt} for loc, cnt in top_locations
        ],
    })

    return jsonify({'status': 'ok', 'total': len(packages)}), 200


@app.route('/api/packages', methods=['GET'])
def get_packages():
    top_locations = location_counts.most_common(10)
    now = time.time()
    recent = sum(1 for t in activity_log if t > now - 5)
    rate = round(recent / 5, 1)

    return jsonify({
        'packages': packages[-200:],
        'stats': {
            'total_packages': len(packages),
            'suspicious_count': suspicious_total,
            'rate': rate,
            'unique_locations': len(location_counts),
        },
        'top_locations': [
            {'location': loc, 'count': cnt} for loc, cnt in top_locations
        ],
    })


@socketio.on('connect')
def on_connect():
    print('Frontend client connected')
    top_locations = location_counts.most_common(10)
    now = time.time()
    recent = sum(1 for t in activity_log if t > now - 5)
    rate = round(recent / 5, 1)

    emit('init', {
        'packages': packages[-200:],
        'stats': {
            'total_packages': len(packages),
            'suspicious_count': suspicious_total,
            'rate': rate,
            'unique_locations': len(location_counts),
        },
        'top_locations': [
            {'location': loc, 'count': cnt} for loc, cnt in top_locations
        ],
    })


@socketio.on('disconnect')
def on_disconnect():
    print('Frontend client disconnected')


if __name__ == '__main__':
    print("Starting Flask-SocketIO server on port 5000 …")
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)