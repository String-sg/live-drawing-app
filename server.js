const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Main routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/student', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

app.get('/console', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Store drawing history for each student and track teachers
const rooms = new Map(); // sessionCode -> { students: Map<username, {history, currentStep}>, teacherSocketId: string }

io.on('connection', (socket) => {
    console.log('User connected with ID:', socket.id);
    
    // Track user session data
    let userRoom = null;
    let username = null;
    let isTeacher = false;

    // Handle teacher joining a session
    socket.on('teacherJoin', (sessionCode) => {
        console.log('Teacher joined with code:', sessionCode);
        userRoom = sessionCode;
        isTeacher = true;
        
        // Store in socket data
        socket.data.isTeacher = true;
        
        // Join the socket.io room
        socket.join(userRoom);
        
        // Initialize or update room data
        if (!rooms.has(userRoom)) {
            rooms.set(userRoom, {
                students: new Map(),
                teacherSocketId: socket.id
            });
            console.log('Created new room:', userRoom);
        } else {
            // Update teacher socket ID if room already exists
            rooms.get(userRoom).teacherSocketId = socket.id;
            console.log('Updated teacher socket for room:', userRoom);
        }
        
        logRoomsStatus();
    });

    // Handle student joining a session
    socket.on('joinRoom', ({ username: user, sessionCode }) => {
        console.log('Student attempting to join:', user, 'Room:', sessionCode);
        username = user;
        userRoom = sessionCode;
        
        // Store username and role in socket data for easy identification
        socket.data.username = username;
        socket.data.isTeacher = false;
        
        // Check if room exists (teacher is connected)
        if (!rooms.has(userRoom)) {
            console.log('Room not found, teacher not connected');
            socket.emit('teacherDisconnected');
            return;
        }

        // Join the socket.io room
        socket.join(userRoom);

        // Initialize student data
        const room = rooms.get(userRoom);
        if (!room.students.has(username)) {
            room.students.set(username, {
                history: [],
                currentStep: -1
            });
            console.log('Added new student to room:', username);
        }

        // Notify teacher of new student
        if (room.teacherSocketId) {
            io.to(room.teacherSocketId).emit('studentJoined', { username });
            console.log('Emitted studentJoined event to teacher for:', username);
        }

        // Send current drawing state to new connection
        const studentData = room.students.get(username);
        if (studentData.history.length > 0) {
            socket.emit('drawingHistory', { history: studentData.history });
        }
        
        logRoomsStatus();
    });

    // Handle drawing events
    socket.on('drawBatch', ({ username, sessionCode, batch, paths }) => {
        if (!rooms.has(sessionCode)) {
            console.log('Draw attempt for non-existent room:', sessionCode);
            return;
        }
        
        const room = rooms.get(sessionCode);
        
        // Verify student exists in the room
        if (!room.students.has(username)) {
            console.log('Draw attempt from unknown student:', username);
            return;
        }
        
        const studentData = room.students.get(username);
        
        if (batch) {
            // Add new drawing data to history (batch format for individual strokes)
            batch.forEach(data => {
                studentData.currentStep++;
                studentData.history = studentData.history.slice(0, studentData.currentStep);
                studentData.history.push(data);
            });
            
            // Broadcast to the teacher
            if (room.teacherSocketId) {
                io.to(room.teacherSocketId).emit('drawBatch', { username, batch });
            }
        } else if (paths) {
            // Store full paths array (full state updates)
            studentData.canvasState = { paths };
            
            console.log(`Received full paths update from ${username} with ${paths.length} paths`);
            
            // Notify the teacher of updated canvas state
            if (room.teacherSocketId) {
                io.to(room.teacherSocketId).emit('studentCanvasData', { 
                    username, 
                    canvasState: { paths } 
                });
            }
        }
    });

    // Handle synchronization requests from students
    socket.on('requestSync', ({ username, sessionCode }) => {
        if (!rooms.has(sessionCode)) return;
        
        const room = rooms.get(sessionCode);
        if (!room.students.has(username)) return;
        
        console.log(`Sync requested by ${username} in room ${sessionCode}`);
        
        // We don't want to request canvas data from other students
        // as that would cause overwriting their work.
        // Instead, just send the student's own data if we have it cached
        
        const studentData = room.students.get(username);
        if (studentData.canvasState && studentData.canvasState.paths) {
            // Send the student their own cached data
            socket.emit('syncResponse', { 
                canvasState: studentData.canvasState 
            });
            console.log(`Sent cached data to ${username} for self-sync`);
        } else {
            // If no cached data, send empty canvas
            socket.emit('syncResponse', { 
                canvasState: { paths: [] } 
            });
            console.log(`No cached data for ${username}, sent empty canvas`);
        }
    });
    
    // Handle request for a specific student's canvas data
    socket.on('requestStudentCanvas', ({ sessionCode, studentUsername }) => {
        if (!rooms.has(sessionCode) || !isTeacher) return;
        
        console.log(`Teacher requesting canvas data for student: ${studentUsername}`);
        
        const room = rooms.get(sessionCode);
        
        // First check if we have cached data
        if (room.students.has(studentUsername) && 
            room.students.get(studentUsername).canvasState &&
            room.students.get(studentUsername).canvasState.paths) {
            
            // Send cached data to the teacher
            const studentData = room.students.get(studentUsername);
            io.to(socket.id).emit('studentCanvasData', {
                username: studentUsername,
                canvasState: studentData.canvasState
            });
            console.log(`Sent cached canvas data for ${studentUsername}`);
        }
        
        // Always request fresh data from the student too (if they're connected)
        // Find the student's socket if they're connected
        if (io.sockets.adapter.rooms.has(sessionCode)) {
            const socketsInRoom = [...io.sockets.adapter.rooms.get(sessionCode)];
            for (const id of socketsInRoom) {
                const studentSocket = io.sockets.sockets.get(id);
                if (studentSocket && 
                    studentSocket.data.username === studentUsername && 
                    !studentSocket.data.isTeacher) {
                    
                    // Request canvas data from this student
                    studentSocket.emit('requestFullCanvas', { forTeacher: true });
                    console.log(`Requested fresh canvas data from ${studentUsername}`);
                    return;
                }
            }
            console.log(`Student socket for ${studentUsername} not found, using cached data only`);
        }
    });
    
    // Handle receiving full canvas data from student
    socket.on('fullCanvasData', ({ username, sessionCode, canvasState, forTeacher }) => {
        if (!rooms.has(sessionCode)) return;
        
        const room = rooms.get(sessionCode);
        console.log(`Received full canvas data from ${username}`);
        
        // Store this data with the student for future
        if (room.students.has(username)) {
            const studentData = room.students.get(username);
            studentData.canvasState = canvasState;
            
            // If this was requested by the teacher, send it only to the teacher
            // and include the username to identify which student's data it is
            if (forTeacher && room.teacherSocketId) {
                io.to(room.teacherSocketId).emit('studentCanvasData', { 
                    username, 
                    canvasState 
                });
            }
        }
    });

    // Handle canvas data for synchronization
    socket.on('canvasData', ({ username, sessionCode, canvasState }) => {
        if (!rooms.has(sessionCode)) return;
        
        const room = rooms.get(sessionCode);
        console.log(`Received canvas data from ${username} with ${canvasState.paths.length} paths`);
        
        // Store this data with the student for future syncs
        if (room.students.has(username)) {
            const studentData = room.students.get(username);
            studentData.canvasState = canvasState;
        }
        
        // Only send to teacher, not to other students
        if (room.teacherSocketId) {
            io.to(room.teacherSocketId).emit('syncResponse', { 
                username,
                canvasState 
            });
        }
    });

    // Handle erase events
    socket.on('erase', ({ username, sessionCode, canvasState }) => {
        if (!rooms.has(sessionCode)) return;
        
        const room = rooms.get(sessionCode);
        if (!room.students.has(username)) return;
        
        // Store updated canvas state
        const studentData = room.students.get(username);
        if (canvasState && canvasState.paths) {
            studentData.canvasState = canvasState;
        }
        
        // Notify the teacher that an erase happened
        if (room.teacherSocketId) {
            io.to(room.teacherSocketId).emit('erase', { 
                username,
                canvasState 
            });
        }
    });

    // Handle undo events
    socket.on('undo', ({ username, sessionCode, canvasState }) => {
        if (!rooms.has(sessionCode)) return;
        
        const room = rooms.get(sessionCode);
        if (!room.students.has(username)) return;
        
        const studentData = room.students.get(username);
        
        // Store updated canvas state after undo
        if (canvasState && canvasState.paths) {
            studentData.canvasState = canvasState;
        }
        
        if (studentData.currentStep > 0) {
            studentData.currentStep--;
            // Notify the teacher
            if (room.teacherSocketId) {
                io.to(room.teacherSocketId).emit('undo', { 
                    username,
                    canvasState
                });
            }
        }
    });

    // Handle clear events
    socket.on('clear', ({ username, sessionCode }) => {
        if (!rooms.has(sessionCode)) return;
        
        const room = rooms.get(sessionCode);
        if (!room.students.has(username)) return;
        
        const studentData = room.students.get(username);
        
        // Reset student's drawing history
        studentData.history = [];
        studentData.currentStep = -1;
        
        // Update the canvas state to empty
        studentData.canvasState = { paths: [] };
        
        // Notify the teacher
        if (room.teacherSocketId) {
            io.to(room.teacherSocketId).emit('clear', { 
                username,
                canvasState: { paths: [] }
            });
        }
    });

    // Handle redo events
    socket.on('redo', ({ username, sessionCode, canvasState }) => {
        if (!rooms.has(sessionCode)) return;
        
        const room = rooms.get(sessionCode);
        if (!room.students.has(username)) return;
        
        const studentData = room.students.get(username);
        
        // Store updated canvas state after redo
        if (canvasState && canvasState.paths) {
            studentData.canvasState = canvasState;
            
            // Notify the teacher of updated canvas
            if (room.teacherSocketId) {
                io.to(room.teacherSocketId).emit('redo', { 
                    username,
                    canvasState
                });
            }
        }
    });

    // Handle text submissions from students
    socket.on('textSubmit', ({ username, sessionCode, text }) => {
        if (!rooms.has(sessionCode)) return;
        
        const room = rooms.get(sessionCode);
        if (!room.students.has(username)) return;
        
        // Validate text input
        if (typeof text !== 'string') return;
        const sanitizedText = text.trim().slice(0, 1000);
        if (!sanitizedText) return;
        
        // Forward text to the teacher
        if (room.teacherSocketId) {
            io.to(room.teacherSocketId).emit('textSubmit', { username, text: sanitizedText });
        }
    });

    // Handle disconnections
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        if (!userRoom) return;
        
        if (isTeacher) {
            // Teacher disconnected - notify all students and clean up
            console.log('Teacher disconnected from room:', userRoom);
            io.in(userRoom).emit('teacherDisconnected');
            rooms.delete(userRoom);
        } else if (username) {
            // Student disconnected
            const room = rooms.get(userRoom);
            if (!room) return;
            
            console.log('Student disconnected:', username);
            
            // Notify teacher
            if (room.teacherSocketId) {
                io.to(room.teacherSocketId).emit('studentLeft', { username });
            }
            
            // Clean up student data
            room.students.delete(username);
            
            // Clean up empty rooms without teachers
            if (room.students.size === 0 && !room.teacherSocketId) {
                rooms.delete(userRoom);
            }
        }
        
        logRoomsStatus();
    });

    // Helper function to log room status
    function logRoomsStatus() {
        console.log('\n--- ROOMS STATUS ---');
        console.log(`Total rooms: ${rooms.size}`);
        
        rooms.forEach((room, code) => {
            console.log(`Room: ${code}, Teacher: ${room.teacherSocketId}, Students: ${room.students.size}`);
            room.students.forEach((data, studentName) => {
                console.log(`  - Student: ${studentName}`);
            });
        });
        console.log('-------------------\n');
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
}); 
