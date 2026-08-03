# EthioBridge

A centralized web platform connecting citizens, government organizations, NGOs, and volunteers across Ethiopia.

## Project Structure

```
zda/
├── backend/    Node.js + Express + MongoDB API
└── frontend/   React + Vite + Tailwind CSS
```

## Quick Start

### 1. Backend Setup

```bash
cd backend
# Edit .env with your MongoDB URI and Cloudinary keys
npm install
npm run dev       # runs on http://localhost:5000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev       # runs on http://localhost:5173
```

### 3. Required .env values (backend/.env)

| Key                       | Description                      |
|---------------------------|----------------------------------|
| MONGO_URI                 | MongoDB connection string        |
| JWT_SECRET                | Any secure random string         |
| CLOUDINARY_CLOUD_NAME     | From Cloudinary dashboard        |
| CLOUDINARY_API_KEY        | From Cloudinary dashboard        |
| CLOUDINARY_API_SECRET     | From Cloudinary dashboard        |
| CLIENT_URL                | http://localhost:5173            |

## Features

- 5 user roles: Citizen, Government, NGO, Volunteer, Admin
- Infrastructure, Emergency, and Missing Person reporting
- Interactive Ethiopia map (OpenStreetMap + Leaflet)
- Real-time notifications (Socket.io)
- Image uploads (Cloudinary)
- Regional risk level map with color-coded risk indicators
- Role-based dashboards with full CRUD
- News & announcements management
- JWT authentication
