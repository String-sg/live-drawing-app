# Live Drawing App

Real-time collaborative drawing and interaction between students and teachers, built on Node.js  <br>

<img width="1470" alt="image" src="https://github.com/user-attachments/assets/04fcf624-a78e-4078-8dde-c3d2f035c39c" />

Try it out at<br>
https://live-drawing-app.onrender.com/teacher.html



## 🎯 Features

- Real-time drawing board for live classroom sessions
- Separate views for students and teachers
- Lightweight frontend with plain HTML/CSS
- Powered by WebSockets for low-latency interaction

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/live-drawing-app.git
cd live-drawing-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Application

```bash
node server.js
```

The app will be available at [http://localhost:3000](http://localhost:3000)

### 4. Access the Interfaces

- **Student View**: `http://localhost:3000/student.html`
- **Teacher View**: `http://localhost:3000/teacher.html`
- **Login Page**: `http://localhost:3000/login.html`

## 🧪 Deployment

To deploy to any Node.js-supported platform (Heroku, Railway, Render, etc.):

1. Push this repo to GitHub.
2. Set the build command to `npm install` and the start command to `node server.js`.
3. Set the health check path to `/health`.
4. Optionally use a reverse proxy or HTTPS config for production.

## 💡 Potential Extensions

- ✍️ **Drawing Tools**: Add pens, erasers, colors, and undo/redo functions.
- 🧑‍🏫 **Annotation Tools**: Enable teachers to annotate student drawings.
- 🔒 **Authentication**: Secure access with user login/role-based access.
- 🖼️ **Image Export**: Allow saving drawings as image files.
- 📊 **Classroom Dashboard**: Let teachers monitor student activity.
- 🌐 **Multi-room Support**: Support multiple classroom sessions concurrently.

## 📁 Folder Structure

```
live-drawing-app/
├── public/              # HTML/CSS frontends
│   ├── login.html
│   ├── student.html
│   ├── teacher.html
│   └── styles.css
├── server.js            # Express + WebSocket server
├── package.json         # Project metadata and dependencies
```

## 📄 License

MIT License — contributions welcome!
