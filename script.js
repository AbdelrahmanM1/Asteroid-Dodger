class GameConfig {
    static CANVAS_WIDTH = 800;
    static CANVAS_HEIGHT = 600;
    static PLAYER_SPEED = 5;
    static LASER_SPEED = 8;
    static LASER_COOLDOWN = 150;
    static PARTICLE_COUNT = 15;
    static STAR_COUNT = 100;
    static MAX_LEADERBOARD = 10;
    static ASTEROID_SPAWN_RATE = 0.02;
}

class GameState {
    constructor() {
        this.reset();
    }

    reset() {
        this.player = { x: 400, y: 300, size: 15, speed: GameConfig.PLAYER_SPEED };
        this.asteroids = [];
        this.lasers = [];
        this.particles = [];
        this.powerUps = [];
        this.score = 0;
        this.lives = 3;
        this.destroyed = 0;
        this.gameRunning = true;
        this.paused = false;
        this.keys = {};
        this.lastShot = 0;
        this.level = 1;
        this.combo = 0;
        this.maxCombo = 0;
    }
}

class AsteroidDodger {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameState = new GameState();
        this.platform = 'pc'; // Default platform
        this.stars = this.initializeStars();
        this.leaderboardData = [];
        this.animationId = null;
        
        // Sound effects simulation
        this.sounds = {
            shoot: () => this.playTone(800, 0.1),
            hit: () => this.playTone(300, 0.2),
            destroy: () => this.playTone(150, 0.3),
            gameOver: () => this.playTone(100, 1)
        };

        this.initializeEventListeners();
        this.initializeMobileControls();
    }

    // Initialize star field
    initializeStars() {
        const stars = [];
        for (let i = 0; i < GameConfig.STAR_COUNT; i++) {
            stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2,
                speed: Math.random() * 2 + 1,
                opacity: Math.random() * 0.8 + 0.2
            });
        }
        return stars;
    }

    // Simple tone generation for sound effects
    playTone(frequency, duration) {
        if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
            try {
                const audioContext = new (AudioContext || webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = frequency;
                oscillator.type = 'square';
                
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + duration);
            } catch (e) {
                // Silently fail if audio context is not available
            }
        }
    }

    // Platform selection
    selectPlatform(platform) {
        this.platform = platform;
        document.getElementById('platformMenu').style.display = 'none';
        
        if (platform === 'mobile') {
            document.getElementById('mobileControls').style.display = 'block';
            document.getElementById('instructions').innerHTML = 
                'Use on-screen controls to move and shoot • Destroy asteroids for points!';
            document.getElementById('pauseInstructions').textContent = 'Tap pause to resume';
        }
        
        this.updateLeaderboardDisplay();
        this.startGameLoop();
    }

    // Enhanced event listeners
    initializeEventListeners() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Window focus/blur for auto-pause
        window.addEventListener('blur', () => {
            if (this.gameState.gameRunning && !this.gameState.paused) {
                this.togglePause();
            }
        });
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.togglePause();
            return;
        }
        
        if (this.gameState.paused) return;
        
        this.gameState.keys[e.key.toLowerCase()] = true;
        this.gameState.keys[e.code.toLowerCase()] = true;
        
        if (e.key === ' ' && this.gameState.gameRunning) {
            e.preventDefault();
            this.shootLaser();
        }
    }

    handleKeyUp(e) {
        if (this.gameState.paused) return;
        this.gameState.keys[e.key.toLowerCase()] = false;
        this.gameState.keys[e.code.toLowerCase()] = false;
    }

    // Fixed mobile controls initialization
    initializeMobileControls() {
        const dpadButtons = document.querySelectorAll('.dpad-btn');
        const shootButton = document.getElementById('shootBtn');
        
        // D-pad controls with proper event handling
        dpadButtons.forEach(btn => {
            // Handle both touch and mouse events for better compatibility
            const startEvent = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const direction = btn.dataset.direction;
                const key = this.getDirectionKey(direction);
                this.gameState.keys[key] = true;
                btn.style.background = 'rgba(0, 255, 255, 1)';
                btn.style.transform = 'scale(0.95)';
            };
            
            const endEvent = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const direction = btn.dataset.direction;
                const key = this.getDirectionKey(direction);
                this.gameState.keys[key] = false;
                btn.style.background = 'rgba(0, 255, 255, 0.8)';
                btn.style.transform = 'scale(1)';
            };
            
            // Touch events
            btn.addEventListener('touchstart', startEvent, { passive: false });
            btn.addEventListener('touchend', endEvent, { passive: false });
            btn.addEventListener('touchcancel', endEvent, { passive: false });
            
            // Mouse events (for testing on desktop)
            btn.addEventListener('mousedown', startEvent);
            btn.addEventListener('mouseup', endEvent);
            btn.addEventListener('mouseleave', endEvent);
        });
        
        // Shoot button with proper event handling
        if (shootButton) {
            let isPressed = false;
            let shootInterval;
            
            const startShooting = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isPressed && this.gameState.gameRunning && !this.gameState.paused) {
                    isPressed = true;
                    this.shootLaser();
                    shootButton.style.background = 'rgba(255, 100, 100, 1)';
                    shootButton.style.transform = 'scale(0.95)';
                    
                    // Auto-fire while holding
                    shootInterval = setInterval(() => {
                        if (this.gameState.gameRunning && !this.gameState.paused) {
                            this.shootLaser();
                        }
                    }, GameConfig.LASER_COOLDOWN);
                }
            };
            
            const stopShooting = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                isPressed = false;
                if (shootInterval) {
                    clearInterval(shootInterval);
                    shootInterval = null;
                }
                shootButton.style.background = 'rgba(255, 100, 100, 0.8)';
                shootButton.style.transform = 'scale(1)';
            };
            
            // Touch events
            shootButton.addEventListener('touchstart', startShooting, { passive: false });
            shootButton.addEventListener('touchend', stopShooting, { passive: false });
            shootButton.addEventListener('touchcancel', stopShooting, { passive: false });
            
            // Mouse events
            shootButton.addEventListener('mousedown', startShooting);
            shootButton.addEventListener('mouseup', stopShooting);
            shootButton.addEventListener('mouseleave', stopShooting);
        }
    }

    getDirectionKey(direction) {
        const map = { 
            up: 'arrowup', 
            down: 'arrowdown', 
            left: 'arrowleft', 
            right: 'arrowright' 
        };
        return map[direction];
    }

    // Enhanced laser shooting with cooldown visualization
    shootLaser() {
        const now = Date.now();
        if (now - this.gameState.lastShot > GameConfig.LASER_COOLDOWN) {
            this.gameState.lasers.push({
                x: this.gameState.player.x,
                y: this.gameState.player.y - this.gameState.player.size,
                speed: GameConfig.LASER_SPEED,
                size: 3,
                trail: [] // For laser trail effect
            });
            this.gameState.lastShot = now;
            this.sounds.shoot();
        }
    }

    // Enhanced asteroid creation with varied types
    createAsteroid() {
        const side = Math.floor(Math.random() * 4);
        let x, y, vx, vy;
        
        // Spawn from screen edges
        switch(side) {
            case 0: // Top
                x = Math.random() * this.canvas.width;
                y = -50;
                vx = (Math.random() - 0.5) * 4;
                vy = Math.random() * 3 + 1;
                break;
            case 1: // Right
                x = this.canvas.width + 50;
                y = Math.random() * this.canvas.height;
                vx = -(Math.random() * 3 + 1);
                vy = (Math.random() - 0.5) * 4;
                break;
            case 2: // Bottom
                x = Math.random() * this.canvas.width;
                y = this.canvas.height + 50;
                vx = (Math.random() - 0.5) * 4;
                vy = -(Math.random() * 3 + 1);
                break;
            case 3: // Left
                x = -50;
                y = Math.random() * this.canvas.height;
                vx = Math.random() * 3 + 1;
                vy = (Math.random() - 0.5) * 4;
                break;
        }
        
        // Different asteroid types
        const types = ['normal', 'fast', 'large', 'splitting'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        let asteroid = {
            x, y, vx, vy,
            size: Math.random() * 20 + 15,
            rotation: 0,
            rotSpeed: (Math.random() - 0.5) * 0.2,
            health: 1,
            type: type,
            id: Date.now() + Math.random()
        };
        
        // Modify properties based on type
        switch(type) {
            case 'fast':
                asteroid.vx *= 1.5;
                asteroid.vy *= 1.5;
                asteroid.size *= 0.8;
                break;
            case 'large':
                asteroid.size *= 1.5;
                asteroid.health = 2;
                break;
            case 'splitting':
                asteroid.size *= 0.9;
                break;
        }
        
        return asteroid;
    }

    // Enhanced particle system
    createParticle(x, y, color = 'red', velocity = null) {
        return {
            x, y,
            vx: velocity ? velocity.x : (Math.random() - 0.5) * 10,
            vy: velocity ? velocity.y : (Math.random() - 0.5) * 10,
            life: 30,
            maxLife: 30,
            color: color,
            size: Math.random() * 3 + 1,
            gravity: 0.1
        };
    }

    // Power-up system
    createPowerUp(x, y) {
        const types = ['shield', 'multishot', 'speedboost'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        return {
            x, y,
            type: type,
            size: 12,
            life: 300, // 5 seconds at 60fps
            pulse: 0
        };
    }

    // Game logic updates
    updatePlayer() {
        if (!this.gameState.gameRunning || this.gameState.paused) return;
        
        const player = this.gameState.player;
        const speed = player.speed;
        
        // Movement with bounds checking - Fixed key detection
        if (this.gameState.keys['arrowleft'] || this.gameState.keys['a'] || this.gameState.keys['keya']) {
            player.x = Math.max(player.size, player.x - speed);
        }
        if (this.gameState.keys['arrowright'] || this.gameState.keys['d'] || this.gameState.keys['keyd']) {
            player.x = Math.min(this.canvas.width - player.size, player.x + speed);
        }
        if (this.gameState.keys['arrowup'] || this.gameState.keys['w'] || this.gameState.keys['keyw']) {
            player.y = Math.max(player.size, player.y - speed);
        }
        if (this.gameState.keys['arrowdown'] || this.gameState.keys['s'] || this.gameState.keys['keys']) {
            player.y = Math.min(this.canvas.height - player.size, player.y + speed);
        }
    }

    updateLasers() {
        if (this.gameState.paused) return;
        
        for (let i = this.gameState.lasers.length - 1; i >= 0; i--) {
            const laser = this.gameState.lasers[i];
            
            // Add trail effect
            laser.trail.push({ x: laser.x, y: laser.y });
            if (laser.trail.length > 5) laser.trail.shift();
            
            laser.y -= laser.speed;
            
            // Remove off-screen lasers
            if (laser.y < -10) {
                this.gameState.lasers.splice(i, 1);
                continue;
            }
            
            // Collision detection with asteroids
            for (let j = this.gameState.asteroids.length - 1; j >= 0; j--) {
                const asteroid = this.gameState.asteroids[j];
                if (this.checkCollision(laser, asteroid)) {
                    this.handleAsteroidHit(asteroid, j, laser.x, laser.y);
                    this.gameState.lasers.splice(i, 1);
                    break;
                }
            }
        }
    }

    updateAsteroids() {
        if (this.gameState.paused) return;
        
        for (let i = this.gameState.asteroids.length - 1; i >= 0; i--) {
            const asteroid = this.gameState.asteroids[i];
            
            asteroid.x += asteroid.vx;
            asteroid.y += asteroid.vy;
            asteroid.rotation += asteroid.rotSpeed;
            
            // Remove off-screen asteroids
            if (this.isOffScreen(asteroid)) {
                this.gameState.asteroids.splice(i, 1);
                this.gameState.score += 10; // Bonus for survival
                continue;
            }
            
            // Player collision
            if (this.checkCollision(asteroid, this.gameState.player)) {
                this.handlePlayerHit(asteroid, i);
            }
        }
    }

    updateParticles() {
        if (this.gameState.paused) return;
        
        for (let i = this.gameState.particles.length - 1; i >= 0; i--) {
            const particle = this.gameState.particles[i];
            
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vy += particle.gravity; // Add gravity effect
            particle.vx *= 0.98; // Air resistance
            particle.vy *= 0.98;
            particle.life--;
            
            if (particle.life <= 0) {
                this.gameState.particles.splice(i, 1);
            }
        }
    }

    updatePowerUps() {
        if (this.gameState.paused) return;
        
        for (let i = this.gameState.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.gameState.powerUps[i];
            
            powerUp.pulse += 0.2;
            powerUp.life--;
            
            // Remove expired power-ups
            if (powerUp.life <= 0) {
                this.gameState.powerUps.splice(i, 1);
                continue;
            }
            
            // Check player collision
            if (this.checkCollision(powerUp, this.gameState.player)) {
                this.applyPowerUp(powerUp.type);
                this.gameState.powerUps.splice(i, 1);
            }
        }
    }

    // Collision detection
    checkCollision(obj1, obj2) {
        const dx = obj1.x - obj2.x;
        const dy = obj1.y - obj2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < (obj1.size + obj2.size);
    }

    isOffScreen(obj, margin = 100) {
        return obj.x < -margin || obj.x > this.canvas.width + margin ||
               obj.y < -margin || obj.y > this.canvas.height + margin;
    }

    // Game event handlers
    handleAsteroidHit(asteroid, index, hitX, hitY) {
        // Create explosion particles
        for (let k = 0; k < GameConfig.PARTICLE_COUNT; k++) {
            this.gameState.particles.push(
                this.createParticle(asteroid.x, asteroid.y, 'orange')
            );
        }
        
        // Handle splitting asteroids
        if (asteroid.type === 'splitting' && asteroid.size > 20) {
            this.createSplitAsteroids(asteroid);
        }
        
        // Random power-up spawn
        if (Math.random() < 0.1) { // 10% chance
            this.gameState.powerUps.push(this.createPowerUp(asteroid.x, asteroid.y));
        }
        
        // Scoring with combo system
        let points = 50;
        this.gameState.combo++;
        if (this.gameState.combo > 1) {
            points *= Math.min(this.gameState.combo, 5); // Max 5x multiplier
        }
        this.gameState.maxCombo = Math.max(this.gameState.maxCombo, this.gameState.combo);
        
        this.gameState.score += points;
        this.gameState.destroyed++;
        this.gameState.asteroids.splice(index, 1);
        
        this.sounds.hit();
    }

    handlePlayerHit(asteroid, asteroidIndex) {
        // Create player explosion particles
        for (let j = 0; j < 10; j++) {
            this.gameState.particles.push(
                this.createParticle(this.gameState.player.x, this.gameState.player.y, 'cyan')
            );
        }
        
        this.gameState.lives--;
        this.gameState.combo = 0; // Reset combo on hit
        this.gameState.asteroids.splice(asteroidIndex, 1);
        
        this.sounds.destroy();
        
        if (this.gameState.lives <= 0) {
            this.gameOver();
        }
    }

    createSplitAsteroids(parentAsteroid) {
        for (let i = 0; i < 2; i++) {
            const splitAsteroid = {
                ...parentAsteroid,
                size: parentAsteroid.size * 0.6,
                vx: parentAsteroid.vx + (Math.random() - 0.5) * 4,
                vy: parentAsteroid.vy + (Math.random() - 0.5) * 4,
                type: 'normal',
                id: Date.now() + Math.random() + i
            };
            this.gameState.asteroids.push(splitAsteroid);
        }
    }

    applyPowerUp(type) {
        switch(type) {
            case 'shield':
                this.gameState.lives++;
                break;
            case 'multishot':
                // Temporary multishot ability
                break;
            case 'speedboost':
                this.gameState.player.speed = Math.min(8, this.gameState.player.speed + 1);
                break;
        }
    }

    // Enhanced rendering
    drawStars() {
        for (const star of this.stars) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
            
            if (!this.gameState.paused) {
                star.y += star.speed;
                if (star.y > this.canvas.height) {
                    star.y = -5;
                    star.x = Math.random() * this.canvas.width;
                }
            }
        }
    }

    drawPlayer() {
        const player = this.gameState.player;
        
        // Ship glow effect
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#00ffff';
        
        // Main ship body
        this.ctx.fillStyle = '#00ffff';
        this.ctx.beginPath();
        this.ctx.moveTo(player.x, player.y - player.size);
        this.ctx.lineTo(player.x - player.size, player.y + player.size);
        this.ctx.lineTo(player.x, player.y + player.size/2);
        this.ctx.lineTo(player.x + player.size, player.y + player.size);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Engine trail effect
        if (this.gameState.keys['arrowup'] || this.gameState.keys['w'] || this.gameState.keys['keyw']) {
            this.ctx.fillStyle = '#ff6600';
            this.ctx.beginPath();
            this.ctx.moveTo(player.x - 5, player.y + player.size);
            this.ctx.lineTo(player.x, player.y + player.size + 10);
            this.ctx.lineTo(player.x + 5, player.y + player.size);
            this.ctx.fill();
        }
        
        this.ctx.shadowBlur = 0;
    }

    drawLasers() {
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#00ff00';
        
        for (const laser of this.gameState.lasers) {
            // Draw laser trail
            for (let i = 0; i < laser.trail.length; i++) {
                const alpha = (i + 1) / laser.trail.length * 0.5;
                this.ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`;
                const point = laser.trail[i];
                this.ctx.fillRect(point.x - 1, point.y - 5, 2, 10);
            }
            
            // Draw main laser
            this.ctx.fillStyle = '#00ff00';
            this.ctx.fillRect(laser.x - laser.size/2, laser.y - 10, laser.size, 20);
        }
        
        this.ctx.shadowBlur = 0;
    }

    drawAsteroids() {
        for (const asteroid of this.gameState.asteroids) {
            this.ctx.save();
            this.ctx.translate(asteroid.x, asteroid.y);
            this.ctx.rotate(asteroid.rotation);
            
            // Type-specific rendering
            let color = '#aa4400';
            let glowColor = '#ff6600';
            
            switch(asteroid.type) {
                case 'fast':
                    color = '#aa0044';
                    glowColor = '#ff0066';
                    break;
                case 'large':
                    color = '#444400';
                    glowColor = '#ffff00';
                    break;
                case 'splitting':
                    color = '#440044';
                    glowColor = '#ff00ff';
                    break;
            }
            
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = glowColor;
            
            this.ctx.fillStyle = color;
            this.ctx.strokeStyle = glowColor;
            this.ctx.lineWidth = 2;
            
            // Draw irregular asteroid shape
            this.ctx.beginPath();
            const points = 8;
            for (let i = 0; i < points; i++) {
                const angle = (i / points) * Math.PI * 2;
                const radius = asteroid.size * (0.8 + Math.sin(angle * 3) * 0.2);
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                
                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            
            this.ctx.restore();
            this.ctx.shadowBlur = 0;
        }
    }

    drawParticles() {
        for (const particle of this.gameState.particles) {
            const alpha = particle.life / particle.maxLife;
            let color;
            
            switch(particle.color) {
                case 'orange':
                    color = `rgba(255, 165, 0, ${alpha})`;
                    break;
                case 'cyan':
                    color = `rgba(0, 255, 255, ${alpha})`;
                    break;
                default:
                    color = `rgba(255, 100, 100, ${alpha})`;
            }
            
            this.ctx.fillStyle = color;
            this.ctx.fillRect(
                particle.x - particle.size/2, 
                particle.y - particle.size/2, 
                particle.size, 
                particle.size
            );
        }
    }

    drawPowerUps() {
        for (const powerUp of this.gameState.powerUps) {
            const pulse = Math.sin(powerUp.pulse) * 0.3 + 0.7;
            const size = powerUp.size * pulse;
            
            this.ctx.save();
            this.ctx.translate(powerUp.x, powerUp.y);
            
            let color;
            switch(powerUp.type) {
                case 'shield':
                    color = '#00ff00';
                    break;
                case 'multishot':
                    color = '#ff0000';
                    break;
                case 'speedboost':
                    color = '#ffff00';
                    break;
            }
            
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = color;
            this.ctx.fillStyle = color;
            
            this.ctx.beginPath();
            this.ctx.arc(0, 0, size, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.restore();
            this.ctx.shadowBlur = 0;
        }
    }

    drawHUD() {
        // Combo display
        if (this.gameState.combo > 1) {
            this.ctx.fillStyle = '#ffff00';
            this.ctx.font = '20px Arial';
            this.ctx.fillText(`COMBO: ${this.gameState.combo}x`, 20, 120);
        }
        
        // Level display
        this.ctx.fillStyle = '#00ffff';
        this.ctx.font = '16px Arial';
        this.ctx.fillText(`Level: ${this.gameState.level}`, 20, 140);
    }

    // Game state management
    togglePause() {
        if (!this.gameState.gameRunning) return;
        
        this.gameState.paused = !this.gameState.paused;
        document.getElementById('pauseOverlay').style.display = 
            this.gameState.paused ? 'block' : 'none';
    }

    gameOver() {
        this.gameState.gameRunning = false;
        this.gameState.paused = false;
        
        document.getElementById('pauseOverlay').style.display = 'none';
        document.getElementById('finalScore').textContent = this.gameState.score;
        document.getElementById('finalDestroyed').textContent = this.gameState.destroyed;
        
        const leaderboard = this.getLeaderboard();
        const isHighScore = leaderboard.length < GameConfig.MAX_LEADERBOARD || 
                           this.gameState.score > leaderboard[leaderboard.length - 1]?.score;
        
        document.getElementById('scoreSubmission').style.display = 
            isHighScore ? 'block' : 'none';
        document.getElementById('gameOver').style.display = 'block';
        
        this.sounds.gameOver();
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }

    restartGame() {
        this.gameState.reset();
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('pauseOverlay').style.display = 'none';
        document.getElementById('playerName').value = '';
        this.startGameLoop();
    }

    // Leaderboard management
    getLeaderboard() {
        return this.leaderboardData;
    }

    saveLeaderboard(leaderboard) {
        this.leaderboardData = [...leaderboard];
    }

    updateLeaderboardDisplay() {
        const leaderboard = this.getLeaderboard();
        const listElement = document.getElementById('leaderboardList');
        
        if (leaderboard.length === 0) {
            listElement.innerHTML = '<div class="leaderboard-entry">No scores yet!</div>';
            return;
        }
        
        listElement.innerHTML = leaderboard
            .slice(0, 5)
            .map((entry, index) => 
                `<div class="leaderboard-entry">
                    <span>#${index + 1} ${entry.name}</span>
                    <span>${entry.score}</span>
                </div>`
            ).join('');
    }

    submitScore() {
        const name = document.getElementById('playerName').value.trim() || 'Anonymous';
        const leaderboard = this.getLeaderboard();
        
        leaderboard.push({
            name: name,
            score: this.gameState.score,
            destroyed: this.gameState.destroyed,
            maxCombo: this.gameState.maxCombo,
            date: new Date().toLocaleDateString()
        });
        
        leaderboard.sort((a, b) => b.score - a.score);
        leaderboard.splice(GameConfig.MAX_LEADERBOARD);
        
        this.saveLeaderboard(leaderboard);
        this.updateLeaderboardDisplay();
        
        document.getElementById('scoreSubmission').style.display = 'none';
    }

    // Main game loop
    gameLoop() {
        // Clear canvas with fade effect
        this.ctx.fillStyle = 'rgba(0, 0, 17, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background
        this.drawStars();
        
        if (this.gameState.gameRunning) {
            // Update game objects
            this.updatePlayer();
            this.updateLasers();
            this.updateAsteroids();
            this.updateParticles();
            this.updatePowerUps();
            
            // Spawn asteroids with increasing difficulty
            if (!this.gameState.paused) {
                const spawnRate = GameConfig.ASTEROID_SPAWN_RATE + (this.gameState.score * 0.00001);
                if (Math.random() < spawnRate) {
                    this.gameState.asteroids.push(this.createAsteroid());
                }
                
                // Level progression
                const newLevel = Math.floor(this.gameState.score / 1000) + 1;
                if (newLevel > this.gameState.level) {
                    this.gameState.level = newLevel;
                }
            }
        }
        
        // Draw game objects
        this.drawPlayer();
        this.drawLasers();
        this.drawAsteroids();
        this.drawParticles();
        this.drawPowerUps();
        this.drawHUD();
        
        // Update UI elements
        document.getElementById('score').textContent = this.gameState.score;
        document.getElementById('lives').textContent = this.gameState.lives;
        document.getElementById('destroyed').textContent = this.gameState.destroyed;
        
        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }

    startGameLoop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.gameLoop();
    }
}

// Global game instance
let game;

// Global functions for HTML interaction
function selectPlatform(platform) {
    if (!game) {
        game = new AsteroidDodger();
    }
    game.selectPlatform(platform);
}

function togglePause() {
    if (game) {
        game.togglePause();
    }
}

function submitScore() {
    if (game) {
        game.submitScore();
    }
}

function restartGame() {
    if (game) {
        game.restartGame();
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Create game instance but don't start until platform is selected
    game = new AsteroidDodger();
    
    // Add touch event handling for mobile - FIXED
    if ('ontouchstart' in window) {
        // Prevent default touch behaviors that might interfere with game
        document.addEventListener('touchmove', function(e) {
            // Only prevent default for game canvas area
            if (e.target.closest('.game-container')) {
                e.preventDefault();
            }
        }, { passive: false });
        
        document.addEventListener('touchstart', function(e) {
            // Only prevent default for control elements
            if (e.target.closest('.dpad-btn') || e.target.closest('.shoot-btn')) {
                e.preventDefault();
            }
        }, { passive: false });
    }
    
    // Add visibility change handler for auto-pause
    document.addEventListener('visibilitychange', function() {
        if (game && document.hidden && game.gameState.gameRunning && !game.gameState.paused) {
            game.togglePause();
        }
    });
    
    // Add resize handler for responsive canvas
    window.addEventListener('resize', function() {
        if (game) {
            // Maintain aspect ratio on resize
            const container = document.querySelector('.game-container');
            const canvas = game.canvas;
            const rect = container.getBoundingClientRect();
            
            // Update canvas display size while keeping internal resolution
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
        }
    });
});

// Additional utility functions
function getRandomColor() {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function lerp(start, end, factor) {
    return start + (end - start) * factor;
}

function distance(obj1, obj2) {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Performance monitoring
class PerformanceMonitor {
    constructor() {
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 0;
    }
    
    update() {
        this.frameCount++;
        const currentTime = performance.now();
        
        if (currentTime - this.lastTime >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            this.frameCount = 0;
            this.lastTime = currentTime;
            
            // Optional: Display FPS in debug mode
            if (window.DEBUG_MODE) {
                console.log(`FPS: ${this.fps}`);
            }
        }
    }
}

// Enhanced particle effects
class ParticleSystem {
    constructor() {
        this.particles = [];
    }
    
    emit(x, y, count, options = {}) {
        const {
            color = 'white',
            speed = 5,
            life = 60,
            spread = Math.PI * 2,
            size = 2
        } = options;
        
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * spread;
            const velocity = Math.random() * speed + 1;
            
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity,
                life: life,
                maxLife: life,
                color: color,
                size: size + Math.random() * 2,
                gravity: 0.1,
                friction: 0.98
            });
        }
    }
    
    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= p.friction;
            p.vy *= p.friction;
            p.life--;
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }
    
    render(ctx) {
        for (const p of this.particles) {
            const alpha = p.life / p.maxLife;
            ctx.fillStyle = `rgba(${this.hexToRgb(p.color)}, ${alpha})`;
            ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
        }
    }
    
    hexToRgb(hex) {
        // Simple hex to rgb conversion for particle colors
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? 
            `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` :
            '255, 255, 255';
    }
}

// Audio manager for better sound handling
class AudioManager {
    constructor() {
        this.audioContext = null;
        this.sounds = {};
        this.volume = 0.3;
        this.enabled = true;
        
        this.initAudioContext();
    }
    
    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.enabled = false;
        }
    }
    
    playTone(frequency, duration, type = 'square') {
        if (!this.enabled || !this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.value = frequency;
            oscillator.type = type;
            
            gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        } catch (e) {
            console.warn('Audio playback failed:', e);
        }
    }
    
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }
    
    toggleMute() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

// Input manager for better control handling
class InputManager {
    constructor() {
        this.keys = {};
        this.mouse = { x: 0, y: 0, clicked: false };
        this.touches = [];
        
        this.bindEvents();
    }
    
    bindEvents() {
        // Keyboard events
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            this.keys[e.key.toLowerCase()] = true;
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this.keys[e.key.toLowerCase()] = false;
        });
        
        // Mouse events
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        
        window.addEventListener('mousedown', () => {
            this.mouse.clicked = true;
        });
        
        window.addEventListener('mouseup', () => {
            this.mouse.clicked = false;
        });
        
        // Touch events
        window.addEventListener('touchstart', (e) => {
            this.touches = Array.from(e.touches);
        });
        
        window.addEventListener('touchmove', (e) => {
            this.touches = Array.from(e.touches);
        });
        
        window.addEventListener('touchend', (e) => {
            this.touches = Array.from(e.touches);
        });
    }
    
    isKeyPressed(key) {
        return !!this.keys[key];
    }
    
    isMouseClicked() {
        return this.mouse.clicked;
    }
    
    getTouchCount() {
        return this.touches.length;
    }
}

// Game settings manager
class SettingsManager {
    constructor() {
        this.settings = {
            volume: 0.3,
            difficulty: 'normal',
            showFPS: false,
            particles: true,
            screenShake: true,
            autoFire: false
        };
        
        this.loadSettings();
    }
    
    loadSettings() {
        // In a real application, you might load from localStorage
        // For this demo, we'll use default settings
        console.log('Settings loaded:', this.settings);
    }
    
    saveSettings() {
        // In a real application, you might save to localStorage
        console.log('Settings saved:', this.settings);
    }
    
    getSetting(key) {
        return this.settings[key];
    }
    
    setSetting(key, value) {
        if (key in this.settings) {
            this.settings[key] = value;
            this.saveSettings();
            return true;
        }
        return false;
    }
}

// Achievement system
class AchievementManager {
    constructor() {
        this.achievements = {
            firstKill: { name: 'First Blood', description: 'Destroy your first asteroid', unlocked: false },
            sharpshooter: { name: 'Sharpshooter', description: 'Achieve 10x combo', unlocked: false },
            survivor: { name: 'Survivor', description: 'Survive 5 minutes', unlocked: false },
            destroyer: { name: 'Destroyer', description: 'Destroy 100 asteroids', unlocked: false },
            perfectionist: { name: 'Perfectionist', description: 'Complete a level without taking damage', unlocked: false }
        };
        
        this.loadAchievements();
    }
    
    loadAchievements() {
        // Load from storage in real implementation
        console.log('Achievements loaded');
    }
    
    saveAchievements() {
        // Save to storage in real implementation
        console.log('Achievements saved');
    }
    
    checkAchievement(type, value) {
        let unlocked = false;
        
        switch(type) {
            case 'firstKill':
                if (value >= 1 && !this.achievements.firstKill.unlocked) {
                    this.achievements.firstKill.unlocked = true;
                    unlocked = 'firstKill';
                }
                break;
            case 'combo':
                if (value >= 10 && !this.achievements.sharpshooter.unlocked) {
                    this.achievements.sharpshooter.unlocked = true;
                    unlocked = 'sharpshooter';
                }
                break;
            case 'destroyed':
                if (value >= 100 && !this.achievements.destroyer.unlocked) {
                    this.achievements.destroyer.unlocked = true;
                    unlocked = 'destroyer';
                }
                break;
        }
        
        if (unlocked) {
            this.saveAchievements();
            this.showAchievementNotification(unlocked);
        }
        
        return unlocked;
    }
    
    showAchievementNotification(achievementKey) {
        const achievement = this.achievements[achievementKey];
        console.log(`🏆 Achievement Unlocked: ${achievement.name} - ${achievement.description}`);
        
        // In a real implementation, you might show a toast notification
    }
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AsteroidDodger,
        GameConfig,
        GameState,
        PerformanceMonitor,
        ParticleSystem,
        AudioManager,
        InputManager,
        SettingsManager,
        AchievementManager
    };
}