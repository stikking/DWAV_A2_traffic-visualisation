# Traffic Visualization
## Structure
```text
traffic-visualization/
├── docker-compose.yml
├── data/
│   └── ip_addresses.csv
├── sender/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── sender.py
├── server/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app.py
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── html/
        ├── index.html
        ├── css/
        │   └── style.css
        └── js/
            └── app.js
```
## How to Run
1: Place ip_addresses.csv in the data/ folder. (if not here already)
2: Run:
```bash
docker-compose up --build
```
3: Open: http://localhost:8080
