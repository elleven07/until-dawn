"use strict";

const canvas = document.getElementById("gameCanvas");
let ctx = canvas.getContext("2d");


// ========================================
// GAME SETTINGS
// ========================================

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;

canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

// Set to false to remove moon shard pickups completely
const SHARDS_ENABLED = true;


// ========================================
// WORLD SETTINGS
// ========================================

const world = {
    groundY: 450,
    gravity: 2600,

    // Falling is faster than rising, which makes jumps feel snappy
    fallMultiplier: 1.35,

    baseSpeed: 300,
    maxSpeed: 620,

    // Current speed (grows over time)
    scrollSpeed: 300
};


// ========================================
// GAME STATE
// ========================================
// "loading"  - boot screen, waits for assets, then "press any key"
// "intro"    - short story text (first visit only)
// "menu"     - title screen, world scrolls slowly
// "playing"  - normal gameplay
// "paused"   - frozen
// "dying"    - last heart lost, death animation plays
// "gameover" - game over screen showing

let state = "loading";

let score = 0;
let distance = 0;
let shardCount = 0;
let bonusPoints = 0;
let elapsed = 0;
let playerLives = 3;
let MAX_LIVES = 3;   // set each run: 3, plus the Silver Charm upgrade

let dyingTimer = 0;
let gameOverShownAt = 0;

let bestScore = 0;

try {
    bestScore = parseInt(localStorage.getItem("untilDawn.best"), 10) || 0;
} catch (e) { /* storage not available */ }


// ========================================
// UI ELEMENTS
// ========================================

const ui = {
    loading: document.getElementById("loading-screen"),
    intro: document.getElementById("intro-screen"),
    howto: document.getElementById("howto-screen"),

    storyText: document.getElementById("story-text"),
    storyNext: document.getElementById("story-next"),
    storyDots: [0, 1, 2, 3].map((i) =>
        document.getElementById("story-dot-" + i)
    ),

    loadFill: document.getElementById("load-fill"),
    loadText: document.getElementById("load-text"),
    loadTip: document.getElementById("load-tip"),
    loadPrompt: document.getElementById("load-prompt"),

    menu: document.getElementById("menu-screen"),
    pause: document.getElementById("pause-screen"),
    gameover: document.getElementById("gameover-screen"),

    menuBest: document.getElementById("menu-best"),
    finalScore: document.getElementById("final-score"),
    finalDistance: document.getElementById("final-distance"),
    finalShards: document.getElementById("final-shards"),
    finalBest: document.getElementById("final-best"),
    newBest: document.getElementById("new-best"),
    gameoverMsg: document.getElementById("gameover-msg"),
    rowShards: document.getElementById("row-shards"),

    finalMissions: document.getElementById("final-missions"),
    finalNights: document.getElementById("final-nights"),

    missions: document.getElementById("missions-screen"),
    missionsList: document.getElementById("missions-list"),
    missionsLevel: document.getElementById("missions-level"),
    missionsNote: document.getElementById("missions-note"),

    pauseMissions: document.getElementById("pause-missions"),
    pauseLevel: document.getElementById("pause-level"),
    pauseNote: document.getElementById("pause-note"),

    shop: document.getElementById("shop-screen"),
    shopBank: document.getElementById("shop-bank"),
    shopList: document.getElementById("shop-list"),
    shopMsg: document.getElementById("shop-msg"),
    menuBank: document.getElementById("menu-bank"),

    muteBtn: document.getElementById("mute-btn")
};

function showOverlay(name) {

    ui.loading.classList.add("hidden");
    ui.intro.classList.add("hidden");
    ui.howto.classList.add("hidden");
    ui.menu.classList.add("hidden");
    ui.pause.classList.add("hidden");
    ui.shop.classList.add("hidden");
    ui.missions.classList.add("hidden");
    ui.gameover.classList.add("hidden");

    if (name && ui[name]) {
        ui[name].classList.remove("hidden");
    }
}


// ========================================
// IMAGE HELPERS
// ========================================

// Every image the game asks for is remembered here,
// so the loading bar can show real progress
const imageRegistry = [];

// ----------------------------------------
// FONTS
// ----------------------------------------
// Loaded locally by the @font-face rules in style.css.
// If one can't load, the fallbacks after the commas are used.
const FONT_UI = "'Pixelify Sans', 'Arial Black', Impact, sans-serif";

const FONT_FILES = [
    "20px 'Pixelify Sans'",
    "20px VT323",
    "40px Creepster"
];

let fontsPending = FONT_FILES.length;

if (document.fonts && document.fonts.load) {

    FONT_FILES.forEach((spec) => {

        document.fonts.load(spec)
            .catch(() => { /* fall back to the backup font */ })
            .then(() => { fontsPending--; });
    });
}

else {

    fontsPending = 0;
}

function loadImage(src) {

    const img = new Image();

    img.src = src;

    imageRegistry.push(img);

    return img;
}

// True only when the image really loaded
// (so the game still runs if an asset path is wrong)
function ready(img) {

    return img && img.complete && img.naturalWidth > 0;
}


// ========================================
// PLAYER
// ========================================

const player = {

    // Position
    x: 150,
    y: 0,

    // Collision size
    width: 50,
    height: 70,

    // Vertical physics
    velocityY: 0,
    jumpForce: 820,
    isGrounded: false,
    wasGrounded: false,

    // Jump forgiveness
    // jumpBuffer: a press just before landing still counts
    // coyote: a press just after leaving the ground still counts
    jumpBuffer: 0,
    jumpBufferTime: 0.14,
    coyote: 0,
    coyoteTime: 0.08,

    // Sprites
    runSprite: loadImage("assets/images/character/Run.png"),
    jumpSprite: loadImage("assets/images/character/Jump.png"),
    attackSprite: loadImage("assets/images/character/Attack.png"),
    hurtSprite: loadImage("assets/images/character/Hurt.png"),
    deadSprite: loadImage("assets/images/character/Dead.png"),

    // Animation frames
    runFrame: 0,
    jumpFrame: 0,
    attackFrame: 0,
    hurtFrame: 0,
    deadFrame: 0,

    runFrameCount: 8,
    jumpFrameCount: 8,
    attackFrameCount: 3,
    hurtFrameCount: 2,
    deadFrameCount: 5,

    // Sprite frame size
    frameWidth: 128,
    frameHeight: 128,

    // Animation
    animationTimer: 0,
    animationSpeed: 0.12,

    currentAnimation: "run",

    // Jump animation progress (seconds in the air)
    jumpTime: 0,

    // Attack
    isAttacking: false,
    attackCooldown: 0,
    attackCooldownDuration: 0.3,

    // Hurt
    isHurt: false,
    hurtTimer: 0,
    hurtDuration: 0.5,

    // Brief invincibility after getting hit
    invulnTimer: 0,
    invulnDuration: 1.2,

    // Stun from a bird hit (blocks jumping and moving)
    stunTimer: 0
};


// ========================================
// WEREWOLF
// ========================================

const werewolf = {

    // Position
    x: 40,
    y: 0,

    // Collision size
    width: 70,
    height: 80,

    // Movement
    speed: 250,
    velocityY: 0,
    isGrounded: true,

    // Automatic pit-jumping
    jumpTimer: 0,
    jumpDuration: 0.8,
    jumpHeight: 95,
    jumpPit: null,

    // Sprites
    runSprite: loadImage("assets/images/werewolf/Run.png"),
    jumpSprite: loadImage("assets/images/werewolf/Jump.png"),
    attackSprite: loadImage("assets/images/werewolf/Attack.png"),
    runAttackSprite: loadImage("assets/images/werewolf/RunAttack.png"),

    // Animation frames
    runFrame: 0,
    jumpFrame: 0,
    attackFrame: 0,
    runAttackFrame: 0,

    runFrameCount: 9,
    jumpFrameCount: 11,
    attackFrameCount: 4,
    runAttackFrameCount: 7,

    // Sprite frame size
    frameWidth: 128,
    frameHeight: 128,

    // Animation
    animationTimer: 0,
    animationSpeed: 0.12,

    currentAnimation: "run",

    // Active
    active: true,

    // Chase distance (gap behind the player)
    distance: 130,

    minDistance: 30,
    maxDistance: 160,

    // Attack
    isAttacking: false,
    hitApplied: false,

    attackTimer: 0,

    attackCooldown: 0,
    attackCooldownDuration: 2.4,

    // Crouch-and-growl timer before a pounce
    windup: 0,

    // Gap still to close after a stumble (it closes a little at a time)
    pendingClose: 0,

    // Seconds the wolf is held back by a Moonlight Burst
    hold: 0,

    threat: 0,        // stumbles in the current danger window
    threatTimer: 0,   // seconds left in that window
    strike: false     // true = the wolf goes for you
};

werewolf.y = world.groundY - werewolf.height;


// The chase. Tune the wolf here.
// It rests at homeGap. A stumble pulls it closer; stumble twice inside
// "window" seconds and it pounces. Otherwise it falls back into place.
const WOLF = {
    homeGap: 130,       // where the wolf rests when you run clean
    window: 6,          // seconds after a stumble that count as "a short time"
    stumble: 45,        // gap lost to the wolf on each stumble (pixels)
    closeRate: 140,     // how fast that gap closes (pixels per second)
    recover: 24,        // how fast it falls back into place (pixels per second)
    windup: 0.45,       // seconds it crouches and growls before pouncing
    reach: 110          // sprint further than this from the wolf and its pounce misses
};

// Moonlight Burst: every shard charges it, R releases it
const BURST = {
    cost: 6,            // shards picked up (this run) to fill the meter
    hold: 4.5,          // seconds the wolf is held back
    fxTime: 0.7
};

const burst = { charge: 0, fx: 0 };

// A stumble pulls the wolf closer, a little at a time. A second stumble
// inside the danger window makes it pounce.
function pushWolf(amount) {

    const w = werewolf;

    // Held back by a burst, or already attacking: nothing to add
    if (w.hold > 0 || w.isAttacking || w.windup > 0) {
        return;
    }

    // Later nights: every stumble lets it in a little more
    w.pendingClose +=
        amount * Math.min(1.75, 1 + NIGHT.harder.wolfHunger * nightLevel());

    w.threat++;
    w.threatTimer = WOLF.window;

    if (w.threat >= 2) {

        // Second stumble in a short time: it goes for you
        w.threat = 0;
        w.threatTimer = 0;
        w.strike = true;

        addFloatText(w.x + 10, w.y - 50, "IT POUNCES!", "#ff5a4a");
    }

    else {

        addFloatText(w.x + 10, w.y - 50, "IT'S CLOSING IN", "#ff9f7a");
    }
}

// The wolf forgets about you (after a burst, or on a new run)
function calmWolf() {

    const w = werewolf;

    w.threat = 0;
    w.threatTimer = 0;
    w.strike = false;
}

function tryBurst() {

    if (state !== "playing" || burst.charge < BURST.cost) {
        return;
    }

    burst.charge = 0;
    burst.fx = BURST.fxTime;

    const w = werewolf;

    w.isAttacking = false;
    w.hitApplied = false;
    w.windup = 0;
    w.pendingClose = 0;
    calmWolf();
    w.currentAnimation = "run";
    w.attackFrame = 0;

    w.distance = w.maxDistance;
    w.hold = BURST.hold;
    w.attackCooldown = BURST.hold;

    sfx.burst();

    spawnParticles(player.x + 25, player.y + 30, 18, "#9fd0ff", 340);

    addFloatText(player.x - 10, player.y - 40, "MOONLIGHT BURST", "#9fd0ff");
}

// The Silver Charm takes one bite per run
function shieldBlock() {

    const w = werewolf;

    player.shield = false;
    player.invulnTimer = 1.0;

    w.isAttacking = false;
    w.hitApplied = false;
    w.windup = 0;
    w.pendingClose = 0;
    w.currentAnimation = "run";
    w.attackFrame = 0;

    w.distance = w.maxDistance;
    w.attackCooldown = 2.5;

    shake = 0.25;

    sfx.parry();

    addFloatText(player.x - 20, player.y - 20, "CHARM SHATTERED", "#cfe6ff");

    spawnParticles(player.x + 25, player.y + 30, 16, "#cfe6ff", 320);
}


// ========================================
// OBSTACLES
// ========================================

const OBSTACLE_TYPES = {

    // A log that has fallen from above (drawn in code, smashable)
    log: {
        width: 76,
        height: 24,
        color: "#302321"
    }
};

let obstacles = [];

// Ground pits — separate from logs and cave traps
const PITS = {
    firstAt: 18,
    gapMin: 5,
    gapMax: 8,
    smallMin: 100,
    smallMax: 125,
    largeMin: 175,
    largeMax: 200,
    spacing: 360
};

let pits = [];
let pitTimer = PITS.firstAt;

const PIT_CLOSE = 0.35;   // seconds the ground takes to fill back in after a fall

function jumpDistance() {
    return jumpAirTime() * world.scrollSpeed;
}

function spawnPit() {

    // Not inside a cave, and not while a log is falling
    if (tunnel || wipe || drops.length > 0) {
        return false;
    }

    const x = GAME_WIDTH + 20;

    // Keep clear of other hazards
    for (let i = 0; i < obstacles.length; i++) {
        if (Math.abs(obstacles[i].x - x) < PITS.spacing) {
            return false;
        }
    }

    for (let i = 0; i < caveTraps.length; i++) {
        if (Math.abs(caveTraps[i].x - x) < PITS.spacing) {
            return false;
        }
    }

    const large = Math.random() < 0.4;
    const min = large ? PITS.largeMin : PITS.smallMin;
    const max = large ? PITS.largeMax : PITS.smallMax;

    let w = min + Math.random() * (max - min);

    // Never wider than a jump can cross at the current speed
    w = Math.min(w, jumpDistance() * 0.7);

    const rough = () =>
        Array.from({ length: 8 }, () => 2 + Math.floor(Math.random() * 7));

    pits.push({
        x: x,
        width: w,
        hit: false,
        cleared: false,
        closing: 0,
        edgeL: rough(),
        edgeR: rough()
    });

    // Three moon shards in an arc over the hole: a reward for the jump
    if (SHARDS_ENABLED) {

        [0.25, 0.5, 0.75].forEach((f, i) => {

            shards.push({
                x: x + w * f - SHARD_SIZE.width / 2,
                y: world.groundY - (i === 1 ? 150 : 125),
                width: SHARD_SIZE.width,
                height: SHARD_SIZE.height,
                phase: Math.random() * 6
            });
        });
    }

    return true;
}

// Falling into a pit ends the run
function fallIntoPit(p) {

    p.hit = true;

    playerLives = 0;

    flash = 0.3;
    shake = 0.3;

    sfx.pit();

    die();

    // She drops into the hole instead of lying on the ground
    player.falling = true;
    player.fallPit = p;
    player.isGrounded = false;
    player.wasGrounded = false;
    player.velocityY = 150;
    player.jumpTime = jumpAirTime();
    player.currentAnimation = "jump";

    // The wolf stops at the edge
    werewolf.windup = 0;
}

function updatePits(dt) {

    pitTimer -= dt;

    if (pitTimer <= 0) {

        pitTimer = spawnPit()
            ? PITS.gapMin + Math.random() * (PITS.gapMax - PITS.gapMin)
            : 0.4;
    }

    const box = getPlayerBox();
    const cx = (box.left + box.right) / 2;

    for (let i = pits.length - 1; i >= 0; i--) {

        const p = pits[i];

        p.x -= world.scrollSpeed * dt;

        if (p.hit) {
            p.closing += dt;
        }

        if (p.x + p.width < -20) {
            pits.splice(i, 1);
            continue;
        }

        // Keep shards and flasks from sitting over the hole
        const lift = (item) => {
            if (
                item.y > world.groundY - 80 &&
                item.x + item.width > p.x &&
                item.x < p.x + p.width
            ) {
                item.y = world.groundY - 125;
            }
        };

        shards.forEach(lift);
        fuels.forEach(lift);

        if (p.hit || p.cleared) {
            continue;
        }

        // On the ground with your middle over the hole = you fall
        const over =
            box.bottom >= world.groundY - 8 &&
            cx > p.x + 10 &&
            cx < p.x + p.width - 10;

        if (over) {

            fallIntoPit(p);

            if (state !== "playing") {
                break;
            }
        }

        else if (cx > p.x + p.width) {

            p.cleared = true;

            bonusPoints += 5;

            missionEvent("pits");

            addFloatText(player.x, player.y - 30, "+5", "#e8c98a");
        }
    }
}

// Cuts the hole into the ground (called at the end of drawGround)
function drawPits(look) {

    const top = world.groundY;
    const bottom = GAME_HEIGHT;

    pits.forEach((p) => {

        const x = Math.round(p.x);
        const w = Math.round(p.width);

        // The void
        const g = ctx.createLinearGradient(0, top, 0, bottom);

        g.addColorStop(0, "#07040d");
        g.addColorStop(1, "#000000");

        ctx.fillStyle = g;
        ctx.fillRect(x, top, w, bottom - top);

        // Ragged earth walls
        ctx.fillStyle = look.dirt;

        for (let i = 0; i < p.edgeL.length; i++) {

            ctx.fillRect(x, top + i * 14, p.edgeL[i], 14);
            ctx.fillRect(x + w - p.edgeR[i], top + i * 14, p.edgeR[i], 14);
        }

        // Grass lip on both shoulders
        ctx.fillStyle = look.grass;
        ctx.fillRect(x, top, 6, 8);
        ctx.fillRect(x + w - 6, top, 6, 8);

        ctx.fillStyle = look.edge;
        ctx.fillRect(x, top, 6, 2);
        ctx.fillRect(x + w - 6, top, 6, 2);

        // After a fall the dirt rises and fills the hole
        if (p.hit) {

            const k = Math.min(1, p.closing / PIT_CLOSE);
            const dirtTop = bottom - (bottom - top) * k;

            ctx.fillStyle = look.dirt;
            ctx.fillRect(x, dirtTop, w, bottom - dirtTop);

            if (k >= 1) {
                ctx.fillStyle = look.grass;
                ctx.fillRect(x, top, w, 8);
            }
        }
    });
}

// Faint glow on the edges so pits can still be seen in the dark
function drawPitGlows() {

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    pits.forEach((p) => {

        if (p.hit) {
            return;
        }

        const pulse = 0.5 + 0.5 * Math.sin(time * 4);

        ctx.globalAlpha = 0.35 + 0.25 * pulse;
        ctx.fillStyle = "#8a4cff";

        ctx.fillRect(p.x - 2, world.groundY - 4, 4, 22);
        ctx.fillRect(p.x + p.width - 2, world.groundY - 4, 4, 22);

        ctx.globalAlpha = 0.18 + 0.12 * pulse;
        ctx.fillRect(p.x, world.groundY - 1, p.width, 2);
    });

    ctx.restore();
}


// ========================================
// MOON SHARDS (collectible)
// ========================================

let shards = [];
let shardTimer = 2;

const SHARD_SIZE = { width: 30, height: 40 };

const shardSprite = loadImage("assets/images/items/shard.png");

// A moon shard: your crystal picture with a pulsing glow, a soft halo,
// a gentle sway and little sparkles drifting around it.
// glowOnly = just the soft glow (used on top of the dark).
function drawShard(x, y, w, h, phase, glowOnly) {

    const cx = x + w / 2;
    const cy = y + h / 2 + Math.sin(time * 3 + phase) * 3;

    // The glow breathes in and out
    const pulse = 0.75 + 0.25 * Math.sin(time * 3.4 + phase * 1.7);
    const r = w * 1.9 * (0.9 + 0.2 * pulse);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);

    glow.addColorStop(0, "rgba(150, 215, 255, " + (glowOnly ? 0.45 : 0.55) * pulse + ")");
    glow.addColorStop(0.45, "rgba(110, 170, 255, " + (glowOnly ? 0.18 : 0.24) * pulse + ")");
    glow.addColorStop(1, "rgba(90, 140, 255, 0)");

    ctx.fillStyle = glow;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    ctx.restore();

    if (glowOnly) {
        return;
    }

    if (ready(shardSprite)) {

        const ph = h * 1.3;
        const pw = ph * (shardSprite.naturalWidth / shardSprite.naturalHeight);

        ctx.save();

        ctx.translate(cx, cy);
        ctx.rotate(Math.sin(time * 2 + phase) * 0.09);

        // The picture itself glows
        ctx.shadowColor = "rgba(140, 210, 255, " + (0.6 + 0.4 * pulse) + ")";
        ctx.shadowBlur = 10 + 8 * pulse;

        ctx.drawImage(shardSprite, -pw / 2, -ph / 2, pw, ph);

        // A bright pass of light along the crystal
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.18 * pulse;

        ctx.drawImage(shardSprite, -pw / 2, -ph / 2, pw, ph);

        ctx.restore();

        // Sparkles floating round it
        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        for (let k = 0; k < 3; k++) {

            const t = time * 1.3 + phase + k * 2.1;
            const sx = cx + Math.cos(t * 1.1 + k) * w * 0.8;
            const sy = cy + Math.sin(t * 1.7 + k * 2) * h * 0.55;
            const tw = Math.max(0, Math.sin(t * 4 + k * 3));

            if (tw > 0.2) {

                ctx.globalAlpha = tw;
                ctx.fillStyle = "#e8f6ff";
                ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 3, 2, 6);
                ctx.fillRect(Math.round(sx) - 3, Math.round(sy) - 1, 6, 2);
            }
        }

        ctx.restore();

        return;
    }

    // (no picture file: the old code-drawn crystal)
    // Spin: the crystal narrows and widens
    const hw = (w / 2) * (0.55 + 0.45 * Math.abs(Math.cos(time * 2.2 + phase)));

    const top = cy - h / 2;
    const bottom = cy + h / 2;
    const mid = cy - h * 0.12;

    // Light left half
    ctx.fillStyle = "#e4f3ff";

    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx - hw, mid);
    ctx.lineTo(cx, bottom);
    ctx.closePath();
    ctx.fill();

    // Darker right half
    ctx.fillStyle = "#79b2ee";

    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx + hw, mid);
    ctx.lineTo(cx, bottom);
    ctx.closePath();
    ctx.fill();

    // Outline
    ctx.strokeStyle = "rgba(10, 20, 50, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx + hw, mid);
    ctx.lineTo(cx, bottom);
    ctx.lineTo(cx - hw, mid);
    ctx.closePath();
    ctx.stroke();

    // Twinkle
    if (Math.sin(time * 5 + phase * 2) > 0.6) {

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(cx - 1, top + 3, 2, 8);
        ctx.fillRect(cx - 4, top + 6, 8, 2);
    }
}


// ========================================
// HEART SPRITE
// ========================================

const heartSprite = loadImage("assets/images/ui/heart.png");


// ========================================
// SHOP AND UPGRADES (moon shards are the money)
// ========================================
// Every moon shard picked up goes into the bank straight away and is saved,
// so progress survives dying and closing the page.
// To add an upgrade: add a row to UPGRADES, then use upgradeLevel("id")
// wherever it should have an effect.

const UPGRADES = [
    {
        id: "fuel",
        name: "TORCH FUEL",
        desc: "A bigger tank. The torch burns longer.",
        costs: [15, 30, 50]
    },
    {
        id: "light",
        name: "BRIGHTER TORCH",
        desc: "A wider circle of light.",
        costs: [20, 40, 70]
    },
    {
        id: "flask",
        name: "OIL FLASKS",
        desc: "Each flask refills more fuel.",
        costs: [15, 30, 50]
    },
    {
        id: "heart",
        name: "SILVER CHARM",
        desc: "Blocks the first wolf bite of every run.",
        costs: [60]
    }
];

// What one level adds
const UPGRADE_STEP = {
    fuel: 5,      // seconds added to the torch tank
    light: 25,    // more light radius (pixels)
    flask: 2      // seconds added to each flask
};

let bank = 0;

const upgrades = { fuel: 0, light: 0, flask: 0, heart: 0 };

try {
    bank = parseInt(localStorage.getItem("untilDawn.bank"), 10) || 0;
} catch (e) { /* storage not available */ }

try {

    const saved = JSON.parse(
        localStorage.getItem("untilDawn.upgrades") || "{}"
    );

    UPGRADES.forEach((u) => {

        const level = parseInt(saved[u.id], 10) || 0;

        upgrades[u.id] = Math.max(0, Math.min(u.costs.length, level));
    });

} catch (e) { /* storage not available */ }

function saveShop() {

    try {

        localStorage.setItem("untilDawn.bank", String(bank));

        localStorage.setItem(
            "untilDawn.upgrades",
            JSON.stringify(upgrades)
        );

    } catch (e) { /* ignore */ }
}

function upgradeLevel(id) {

    return upgrades[id] || 0;
}

// What the upgrades actually change
function maxFuel() {

    return NIGHT.fuelMax + UPGRADE_STEP.fuel * upgradeLevel("fuel");
}

function lightRadiusMax() {

    return NIGHT.radiusMax + UPGRADE_STEP.light * upgradeLevel("light");
}

function flaskFuel() {

    // Each night the flasks give a little less (15s, 14s, 12s ... down to 10s)
    const base = Math.max(
        NIGHT.fuelPickupMin,
        NIGHT.fuelPickup - NIGHT.harder.flaskLess * nightLevel()
    );

    return Math.round(base) + UPGRADE_STEP.flask * upgradeLevel("flask");
}

function maxHearts() {

    return 3;
}

function addShards(n) {

    bank += n;

    saveShop();
}

function shopMessage(text) {

    ui.shopMsg.textContent = text;
}

function buyUpgrade(id) {

    const up = UPGRADES.find((u) => u.id === id);

    if (!up) {
        return;
    }

    const level = upgradeLevel(id);

    if (level >= up.costs.length) {
        return;
    }

    const cost = up.costs[level];

    if (bank < cost) {

        shopMessage("Not enough moon shards yet.");

        tone(150, 0.2, "sawtooth", 0.1, 90);

        return;
    }

    bank -= cost;

    upgrades[id] = level + 1;

    saveShop();

    sfx.heal();

    shopMessage(up.name + " upgraded!");

    renderShop();
}

// Builds the list of upgrade rows
function renderShop() {

    ui.shopBank.textContent = bank;

    ui.shopList.innerHTML = "";

    UPGRADES.forEach((up) => {

        const level = upgradeLevel(up.id);
        const maxed = level >= up.costs.length;

        const row = document.createElement("div");
        row.className = "shop-row";

        const info = document.createElement("div");
        info.className = "shop-info";

        const name = document.createElement("span");
        name.className = "shop-name";
        name.textContent = up.name;

        const desc = document.createElement("em");
        desc.className = "shop-desc";
        desc.textContent = up.desc;

        info.appendChild(name);
        info.appendChild(desc);

        const pips = document.createElement("span");
        pips.className = "shop-pips";

        for (let i = 0; i < up.costs.length; i++) {

            const pip = document.createElement("i");

            pip.className = "pip" + (i < level ? " on" : "");

            pips.appendChild(pip);
        }

        const buy = document.createElement("button");

        buy.className =
            "btn shop-buy" +
            (maxed ? " maxed" : (bank < up.costs[level] ? " poor" : ""));

        buy.textContent = maxed ? "MAX" : up.costs[level] + " SHARDS";

        buy.disabled = maxed;

        buy.addEventListener("click", () => {

            initAudio();
            resumeAudio();

            buyUpgrade(up.id);
        });

        row.appendChild(info);
        row.appendChild(pips);
        row.appendChild(buy);

        ui.shopList.appendChild(row);
    });
}

function openShop() {

    ui.menu.classList.add("hidden");

    shopMessage("");

    renderShop();

    ui.shop.classList.remove("hidden");
}

function closeShop() {

    ui.shop.classList.add("hidden");

    if (state === "menu") {

        ui.menuBank.textContent = bank;

        ui.menu.classList.remove("hidden");
    }
}


// ========================================
// MISSIONS (saved goals, paid in moon shards)
// ========================================
// Like Zombie Tsunami: you always have 3 missions. See them on the pause
// screen or with the MISSIONS button on the menu. Finish all 3 to level up:
// you get a bonus and a new set that is a bit harder (bigger goals, bigger
// rewards). Level 1 is deliberately easy.
//
// kind "total" = adds up across all your runs (collect 6 shards, any runs)
// kind "run"   = has to be done within a single run (survive 30 seconds)
//
// Goal at a level   = base + step * level
// Reward at a level = reward + MISSION_LEVEL_REWARD * level
//
// To add a mission: add a row to MISSION_POOL, then call
// missionEvent("yourType") where it happens in the game
// (or missionSet("yourType", value) for something measured during a run).
// "group" stops two similar missions (time and distance) showing together.

const MISSION_POOL = [
    {
        type: "shards", group: "shards", kind: "total",
        text: "Collect {n} moon shards",
        base: 6, step: 6, reward: 4
    },

    {
        type: "logs", group: "logs", kind: "total",
        text: "Break {n} falling logs",
        base: 1, step: 1, reward: 5
    },
    {
        type: "birds", group: "birds", kind: "total",
        text: "Knock down {n} birds",
        base: 2, step: 1, reward: 5
    },
    {
        type: "flasks", group: "flasks", kind: "total",
        text: "Collect {n} oil flasks",
        base: 2, step: 1, reward: 5
    },
    {
        type: "pits", group: "pits", kind: "total",
        text: "Jump over {n} ground pits",
        base: 2, step: 1, reward: 5
    },
    {
        type: "escape", group: "escape", kind: "total",
        text: "Escape {n} wolf attacks",
        base: 2, step: 2, reward: 5
    },
    {
        type: "survive", group: "run", kind: "run",
        text: "Survive {n} seconds",
        base: 30, step: 15, reward: 5
    },
    {
        type: "distance", group: "run", kind: "run",
        text: "Run {n} m",
        base: 200, step: 100, reward: 5
    },
    {
        type: "nights", group: "run", kind: "run",
        text: "Survive {n} night(s)",
        base: 1, step: 1, reward: 8
    }
];

const MISSIONS_PER_SET = 3;

// Extra shards per mission for each level
const MISSION_LEVEL_REWARD = 2;

// Shards for finishing all three missions of a set
const SET_BONUS = { base: 10, perLevel: 5 };

let missionLevel = 0;      // 0 = level 1 (shown to the player as +1)
let missions = [];
let missionToasts = [];

let missionBonus = 0;      // shards earned from missions in this run
let missionsRun = 0;       // missions finished in this run

function missionDef(type) {

    return MISSION_POOL.find((d) => d.type === type);
}

function setBonusFor(level) {

    return SET_BONUS.base + SET_BONUS.perLevel * level;
}

function shuffleList(list) {

    for (let i = list.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        const tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
    }

    return list;
}

function makeMission(def, level) {

    const n = def.base + def.step * level;

    return {
        type: def.type,
        text: def.text.replace("{n}", n),
        target: n,
        reward: def.reward + MISSION_LEVEL_REWARD * level,
        progress: 0,
        done: false
    };
}

// A new set of 3 for the current level
function newMissionSet() {

    const previous = missions.map((m) => m.type);

    // A set that appears in the middle of a run can't use the "single run"
    // missions (the run is already part way through)
    const midRun = state === "playing";

    const pool = shuffleList(
        MISSION_POOL.filter((d) => !(midRun && d.kind === "run"))
    );

    // Prefer types the player did not just have
    pool.sort((a, b) =>
        (previous.includes(a.type) ? 1 : 0) -
        (previous.includes(b.type) ? 1 : 0)
    );

    const used = {};
    const set = [];

    for (let i = 0; i < pool.length && set.length < MISSIONS_PER_SET; i++) {

        if (used[pool[i].group]) {
            continue;
        }

        used[pool[i].group] = true;

        set.push(makeMission(pool[i], missionLevel));
    }

    missions = set;
}

function saveMissions() {

    try {

        localStorage.setItem(
            "untilDawn.missions",
            JSON.stringify({ level: missionLevel, list: missions })
        );

    } catch (e) { /* ignore */ }
}

function loadMissions() {

    let list = [];
    let level = 0;

    try {

        const saved = JSON.parse(
            localStorage.getItem("untilDawn.missions") || "null"
        );

        if (
            saved &&
            Array.isArray(saved.list) &&
            saved.list.length === MISSIONS_PER_SET
        ) {

            level = Math.max(0, parseInt(saved.level, 10) || 0);

            for (let i = 0; i < saved.list.length; i++) {

                const m = saved.list[i];

                const def = missionDef(m && m.type);
                const target = Number(m && m.target);
                const reward = Number(m && m.reward);

                if (!def || !(target > 0) || !(reward >= 0)) {

                    list = [];

                    break;
                }

                const done = !!m.done;

                list.push({
                    type: def.type,
                    text: def.text.replace("{n}", target),
                    target: target,
                    reward: reward,
                    done: done,
                    progress: done
                        ? target
                        : def.kind === "total"
                            ? Math.min(target, Math.max(0, Number(m.progress) || 0))
                            : 0
                });
            }
        }

    } catch (e) {

        list = [];
    }

    if (list.length === MISSIONS_PER_SET) {

        missions = list;
        missionLevel = level;
    }

    else {

        // Nothing saved (or it was damaged): start at level 1
        missionLevel = 0;
        missions = [];

        newMissionSet();

        saveMissions();
    }
}

// New run: "single run" missions start from zero again
function resetRunMissions() {

    missionBonus = 0;
    missionsRun = 0;
    missionToasts = [];

    missions.forEach((m) => {

        if (!m.done && missionDef(m.type).kind === "run") {
            m.progress = 0;
        }
    });
}

function completeMission(m) {

    m.done = true;

    missionsRun++;

    missionBonus += m.reward;

    // Paid straight into the saved bank
    addShards(m.reward);

    sfx.mission();

    missionToasts.push({
        title: "MISSION COMPLETE",
        text: m.text,
        sub: "+" + m.reward + " MOON SHARDS",
        timer: 2.8,
        total: 2.8
    });

    spawnParticles(player.x + 25, player.y, 12, "#9fd0ff", 260);

    addFloatText(player.x, player.y - 40, "MISSION +" + m.reward, "#9fd0ff");

    if (missions.every((x) => x.done)) {

        levelUpMissions();
    }

    else {

        saveMissions();
    }
}

// All three done: bonus shards and a harder set
function levelUpMissions() {

    const bonus = setBonusFor(missionLevel);

    missionBonus += bonus;

    addShards(bonus);

    missionLevel++;

    sfx.levelup();

    missionToasts.push({
        title: "ALL MISSIONS DONE",
        text: "Level " + (missionLevel + 1) + " missions unlocked",
        sub: "+" + bonus + " BONUS SHARDS",
        timer: 3.2,
        total: 3.2
    });

    newMissionSet();

    saveMissions();
}

// Something happened (a shard was picked up, a crate smashed...)
function missionEvent(type, amount) {

    if (state !== "playing") {
        return;
    }

    let changed = false;

    missions.forEach((m) => {

        if (m.type === type && !m.done) {

            m.progress = Math.min(m.target, m.progress + (amount || 1));

            changed = true;

            if (m.progress >= m.target) {
                completeMission(m);
            }
        }
    });

    if (changed) {
        saveMissions();
    }
}

// Something measured during a run (seconds survived, metres run)
function missionSet(type, value) {

    if (state !== "playing") {
        return;
    }

    missions.forEach((m) => {

        if (m.type === type && !m.done) {

            m.progress = Math.min(m.target, value);

            if (m.progress >= m.target) {
                completeMission(m);
            }
        }
    });
}

function updateMissions() {

    missionSet("survive", Math.floor(elapsed));
    missionSet("distance", Math.floor(distance));
    missionSet("nights", nightsSurvived);
}

function tickMissionToasts(dt) {

    if (missionToasts.length > 0) {

        missionToasts[0].timer -= dt;

        if (missionToasts[0].timer <= 0) {

            missionToasts.shift();
        }
    }
}

// "MISSION COMPLETE" slides in at the top of the screen
function drawMissionToast() {

    const t = missionToasts[0];

    if (!t) {
        return;
    }

    const a = Math.max(
        0,
        Math.min(1, t.timer * 2, (t.total - t.timer) * 4)
    );

    const cx = GAME_WIDTH / 2;
    const dy = (1 - a) * -12;

    ctx.save();

    ctx.globalAlpha = a;

    ctx.fillStyle = "rgba(4, 6, 16, 0.78)";
    ctx.fillRect(cx - 175, 64 + dy, 350, 78);

    ctx.strokeStyle = "#79b2ee";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 175, 64 + dy, 350, 78);

    drawText(t.title, cx, 88 + dy, 16, "center", "#f1c40f");
    drawText(t.text, cx, 110 + dy, 12, "center", "#e8e4d8");
    drawText(t.sub, cx, 132 + dy, 14, "center", "#9fd0ff");

    ctx.restore();
}


// ---------- the mission list (pause screen + menu) ----------

function missionRow(m, index) {

    const row = document.createElement("div");

    row.className =
        "mission-row" + (m.done ? " done" : " has-swap");

    const main = document.createElement("div");
    main.className = "mission-main";

    const name = document.createElement("span");
    name.className = "mission-name";
    name.textContent = m.text;

    const bar = document.createElement("div");
    bar.className = "mission-bar";

    const fill = document.createElement("i");
    fill.style.width = Math.round(100 * m.progress / m.target) + "%";

    bar.appendChild(fill);

    const hint = document.createElement("em");
    hint.className = "mission-hint";
    hint.textContent =
        missionDef(m.type).kind === "run"
            ? "In a single run"
            : "Adds up across all your runs";

    main.appendChild(name);
    main.appendChild(bar);
    main.appendChild(hint);

    const count = document.createElement("span");
    count.className = "mission-count";
    count.textContent = m.done ? "DONE" : m.progress + " / " + m.target;

    const reward = document.createElement("span");
    reward.className = "mission-reward";

    const icon = document.createElement("span");
    icon.className = "shard-icon";

    const amount = document.createElement("b");
    amount.textContent = "+" + m.reward;

    reward.appendChild(icon);
    reward.appendChild(amount);

    row.appendChild(main);
    row.appendChild(count);
    row.appendChild(reward);

    // Moon shards can buy a different mission in its place
    if (!m.done) {

        const cost = swapCost();

        const swap = document.createElement("button");

        swap.className = "btn mission-swap" + (bank < cost ? " poor" : "");
        swap.title = "Pay moon shards to replace this mission with a new one";
        swap.textContent = "SWAP " + cost;

        swap.addEventListener("click", () => {

            initAudio();
            resumeAudio();

            swapMission(index);
        });

        row.appendChild(swap);
    }

    return row;
}

// The panel on screen (menu or pause) and its message, so a swap can redraw it
let missionPanel = null;
let missionMsg = "";

function fillMissionPanel(listEl, levelEl, noteEl) {

    missionPanel = { listEl: listEl, levelEl: levelEl, noteEl: noteEl };

    if (levelEl) {
        levelEl.textContent = missionLevel + 1;
    }

    if (noteEl) {

        noteEl.textContent =
            missionMsg ||
            "Finish all " + missions.length + " to reach level " +
            (missionLevel + 2) + " and earn " +
            setBonusFor(missionLevel) + " bonus shards.   " +
            "You have " + bank + " moon shards.";
    }

    listEl.innerHTML = "";

    missions.forEach((m, i) => {

        listEl.appendChild(missionRow(m, i));
    });
}

// Moon shards buy a swap: the mission is replaced by a new one
function swapCost() {

    return 5 + 3 * missionLevel;
}

function swapMission(index) {

    const old = missions[index];

    if (!old || old.done) {
        return;
    }

    const cost = swapCost();

    const redraw = () => {

        if (missionPanel) {

            fillMissionPanel(
                missionPanel.listEl,
                missionPanel.levelEl,
                missionPanel.noteEl
            );
        }

        if (ui.menuBank) {
            ui.menuBank.textContent = bank;
        }
    };

    if (bank < cost) {

        missionMsg = "Not enough moon shards to swap (" + cost + " needed).";

        tone(150, 0.2, "sawtooth", 0.1, 90);

        redraw();

        missionMsg = "";

        return;
    }

    // A run that is already under way cannot take a "single run" mission
    const midRun = state === "playing" || state === "paused";

    const taken = {};

    missions.forEach((m, i) => {

        if (i !== index) {
            taken[missionDef(m.type).group] = true;
        }
    });

    const choices = shuffleList(
        MISSION_POOL.filter((d) =>
            d.type !== old.type &&
            !taken[d.group] &&
            !(midRun && d.kind === "run")
        )
    );

    if (choices.length === 0) {

        missionMsg = "No other mission is available right now.";

        redraw();

        missionMsg = "";

        return;
    }

    bank -= cost;

    saveShop();

    missions[index] = makeMission(choices[0], missionLevel);

    saveMissions();

    sfx.heal();

    missionMsg = "Swapped for " + cost + " moon shards.";

    redraw();

    missionMsg = "";
}

function openMissions() {

    missionMsg = "";

    ui.menu.classList.add("hidden");

    fillMissionPanel(ui.missionsList, ui.missionsLevel, ui.missionsNote);

    ui.missions.classList.remove("hidden");
}

function closeMissions() {

    ui.missions.classList.add("hidden");

    if (state === "menu") {

        ui.menu.classList.remove("hidden");
    }
}

// Load the saved missions as the game starts
loadMissions();


// ========================================
// NIGHT, TORCH AND BIRDS
// ========================================
// The dark creeps in as the run goes on and the torch is the only light.
// Oil flasks refill the torch. Crows and bats fly in from the right
// (a red "!" warns you first); a hit costs a heart and stuns you.
// Everything you might want to tune is in the two lists below.

const NIGHT = {

    // The dark fades in between these two times (seconds into the run)
    darkStart: 25,
    darkFull: 60,

    // How black it gets (1 = pitch black, lower = easier to see)
    maxDarkness: 0.93,

    // Torch light radius in pixels
    radiusMax: 250,
    radiusMin: 70,

    // Torch fuel, measured in SECONDS of burn time
    fuelMax: 30,           // a full torch lasts 30 seconds
    fuelDrain: 1,          // seconds of fuel lost per second (once it is dark)
    fuelPickup: 15,        // seconds one flask gives on night 1...
    fuelPickupMin: 10,     // ...shrinking each night down to this
    flaskGapMin: 9,        // seconds between flasks appearing
    flaskGapMax: 12,
    lowFuel: 8,            // below this many seconds the light starts to shrink
    flickerTime: 5,        // the final seconds: the flame flickers as a warning

    // THE NIGHT CYCLE (it repeats forever)
    // Night 1 ends at dawnAt. Then a short dawn: the dark lifts, the torch
    // refills and you get a bonus. Then the next night falls, a bit harder.
    // Set dawnEnabled to false for one night that never ends.
    dawnEnabled: true,
    dawnAt: 120,        // seconds into the run when the first dawn begins
    dawnLength: 14,     // how long each dawn lasts (10-15 works well)
    dawnLift: 5,        // ...the dark lifts during the first part of it
    duskFade: 5,        // ...and falls again during the last part of it
    nightHold: 70,      // seconds of full dark before the next dawn
    dawnBonus: 5,       // shards for surviving a night (times the night number, max 25)

    // What each extra night adds
    harder: {
        maxDarkness: 0.015,   // a little darker (capped at 0.975)
        flaskLess: 1.5,       // seconds less from each flask
        flaskGap: 0.6,        // seconds longer between flasks (capped at +3)
        birdFaster: 0.5,      // seconds shorter between birds
        wolfHunger: 0.15      // stumbles let the wolf in 15% more (capped at 75%)
    }
};

const BIRDS = {

    firstAt: 15,         // seconds into the run before the first bird
    warnTime: 1.0,       // how long the "!" shows before it arrives
    telegraphTime: 0.5,  // a bat hovers this long before it dives
    diveSpeed: 560,
    stunTime: 0.8,       // seconds you cannot jump or move after a hit
    maxAtOnce: 2
};

let birds = [];
let birdTimer = 1;

let fuels = [];
let fuelTimer = 6;

const FUEL_SIZE = { width: 26, height: 38 };

const torch = { fuel: NIGHT.fuelMax, warned: false };

let bannerText = "";
let bannerSub = "";
let bannerTimer = 0;
let darkAnnounced = false;

let nightsSurvived = 0;
const cycleMark = { dawn: 0, refill: 0, dusk: 0 };

// The dark is drawn on its own canvas, then laid over the scene
const darkLayer = makeCanvas(GAME_WIDTH, GAME_HEIGHT);
const darkCtx = darkLayer.getContext("2d");


// ---------- darkness + torch ----------

const smoothstep = (k) => k * k * (3 - 2 * k);

// Where we are in the night cycle at run time t.
//   night     = the night in progress (during a dawn: the night just survived)
//   dawn      = true while a dawn is happening
//   factor    = 0 (bright) to 1 (full dark)
//   dawnStart = when the current / next dawn begins
//   r         = seconds into the current dawn
function nightCycle(t) {

    const N = NIGHT;

    // Night 1: the dark slowly falls
    if (t < N.dawnAt || !N.dawnEnabled) {

        const k = Math.max(0, Math.min(1,
            (t - N.darkStart) / (N.darkFull - N.darkStart)
        ));

        return { night: 1, dawn: false, factor: smoothstep(k), dawnStart: N.dawnAt, r: 0 };
    }

    const period = N.dawnLength + N.nightHold;

    const done = Math.floor((t - N.dawnAt) / period);
    const start = N.dawnAt + done * period;
    const r = t - start;

    // Full dark again until the next dawn
    if (r >= N.dawnLength) {

        return { night: done + 2, dawn: false, factor: 1, dawnStart: start + period, r: r };
    }

    // Inside a dawn: dark lifts, a bright moment, then dusk comes back
    let f;

    if (r < N.dawnLift) {
        f = 1 - smoothstep(r / N.dawnLift);
    }

    else if (r < N.dawnLength - N.duskFade) {
        f = 0;
    }

    else {
        f = smoothstep((r - (N.dawnLength - N.duskFade)) / N.duskFade);
    }

    return { night: done + 1, dawn: true, factor: f, dawnStart: start, r: r };
}

// 0 on night 1, 1 on night 2, ...
function nightLevel() {

    return Math.max(0, nightCycle(elapsed).night - 1);
}

// 0 = daylight-ish, up to about NIGHT.maxDarkness
function darknessLevel() {

    if (state === "loading" || state === "intro" || state === "menu") {
        return 0;
    }

    const c = nightCycle(elapsed);

    const deepest = Math.min(
        0.975,
        NIGHT.maxDarkness + NIGHT.harder.maxDarkness * (c.night - 1)
    );

    return c.factor * deepest;
}

// 1 = steady flame. In the final seconds it stutters and gets worse
// the closer the torch is to going out (never fully black, so it reads)
function torchFlicker() {

    if (torch.fuel <= 0 || torch.fuel > NIGHT.flickerTime) {
        return 1;
    }

    const k = 1 - torch.fuel / NIGHT.flickerTime;   // 0 -> 1

    const n =
        Math.sin(time * 31) * 0.5 +
        Math.sin(time * 17.3) * 0.3 +
        Math.sin(time * 7.1) * 0.2;

    return Math.max(0.12, Math.min(1, 0.7 + n * (0.3 + 0.4 * k)));
}

function torchRadius() {

    // Full light until the fuel runs low, then it shrinks
    const k = Math.min(1, torch.fuel / NIGHT.lowFuel);

    const base =
        NIGHT.radiusMin + (lightRadiusMax() - NIGHT.radiusMin) * k;

    let flicker =
        Math.sin(time * 13) * 4 +
        Math.sin(time * 7.3) * 3;

    if (torch.fuel < NIGHT.lowFuel) {

        flicker += Math.sin(time * 31) * 5;
    }

    // Final seconds: the whole light pulses with the flame
    const f = torchFlicker();

    return (base + flicker) * (0.65 + 0.35 * f);
}

function updateTorch(dt) {

    if (darknessLevel() > 0.05) {

        torch.fuel = Math.max(0, torch.fuel - NIGHT.fuelDrain * dt);
    }

    // One warning as the final seconds begin
    if (torch.fuel > 0 && torch.fuel <= NIGHT.flickerTime) {

        if (!torch.warned) {

            torch.warned = true;

            addFloatText(player.x + 30, player.y - 50, "TORCH DYING!", "#ff9f7a");
        }
    }

    else {

        torch.warned = false;
    }

    if (!darkAnnounced && elapsed >= NIGHT.darkStart - 1) {

        darkAnnounced = true;

        bannerText = "THE DARKNESS FALLS...";
        bannerSub = "Your torch burns " + Math.round(maxFuel()) + "s. Grab oil flasks to keep it lit";
        bannerTimer = 3.5;

        howl();
    }

    // Dawn, and the next dusk
    const c = nightCycle(elapsed);

    if (NIGHT.dawnEnabled && c.dawn) {

        // A night survived: bonus shards
        if (cycleMark.dawn < c.night) {

            cycleMark.dawn = c.night;

            nightsSurvived = c.night;

            const bonus = Math.min(25, NIGHT.dawnBonus * c.night);

            addShards(bonus);
            shardCount += bonus;

            bannerText = "DAWN BREAKS...";
            bannerSub = "Night " + c.night + " survived   +" + bonus + " moon shards";
            bannerTimer = 4;

            sfx.levelup();
        }

        // Once the dark has lifted the torch is refilled
        if (c.r >= NIGHT.dawnLift && cycleMark.refill < c.night) {

            cycleMark.refill = c.night;

            torch.fuel = maxFuel();
            torch.warned = false;

            sfx.ignite();

            addFloatText(player.x + 10, player.y - 50, "TORCH REFILLED", "#ffb347");
        }

        // The dark starts to fall again
        if (c.r >= NIGHT.dawnLength - NIGHT.duskFade && cycleMark.dusk < c.night) {

            cycleMark.dusk = c.night;

            bannerText = "NIGHT " + (c.night + 1) + " FALLS...";
            bannerSub = "Flasks give less. The wolf grows hungrier.";
            bannerTimer = 3.5;

            howl();
        }
    }

    if (bannerTimer > 0) {
        bannerTimer -= dt;
    }
}


// ---------- oil flasks ----------

function spawnFuel() {

    // Don't spawn right on top of an obstacle
    for (let i = 0; i < obstacles.length; i++) {

        if (obstacles[i].x > GAME_WIDTH - 150) {
            return false;
        }
    }

    const inAir = Math.random() < 0.4;

    fuels.push({
        x: GAME_WIDTH + 60,
        y: inAir
            ? world.groundY - 125
            : world.groundY - FUEL_SIZE.height,
        width: FUEL_SIZE.width,
        height: FUEL_SIZE.height,
        bob: Math.random() * 6
    });

    return true;
}

function updateFuel(dt) {

    // Flasks start appearing as the dark falls
    if (darknessLevel() > 0.05) {

        fuelTimer -= dt;

        if (fuelTimer <= 0) {

            fuelTimer = spawnFuel()
                ? NIGHT.flaskGapMin +
                    Math.min(3, NIGHT.harder.flaskGap * nightLevel()) +
                    Math.random() * (NIGHT.flaskGapMax - NIGHT.flaskGapMin)
                : 0.4;
        }
    }

    const playerBox = getPlayerBox();

    for (let i = fuels.length - 1; i >= 0; i--) {

        const f = fuels[i];

        f.x -= world.scrollSpeed * dt;

        if (f.x + f.width < 0) {

            fuels.splice(i, 1);

            continue;
        }

        // Lift a ground flask out of the way of a nearby obstacle
        if (f.y > world.groundY - 80) {

            for (let j = 0; j < obstacles.length; j++) {

                if (Math.abs(obstacles[j].x - f.x) < 90) {

                    f.y = world.groundY - 125;

                    break;
                }
            }
        }

        if (boxesOverlap(playerBox, getItemBox(f))) {

            fuels.splice(i, 1);

            const gain = flaskFuel();

            torch.fuel = Math.min(maxFuel(), torch.fuel + gain);

            sfx.ignite();

            missionEvent("flasks");

            addFloatText(f.x - 10, f.y - 10, "+" + gain + "s TORCH", "#ffb347");

            spawnParticles(f.x + 13, f.y + 20, 8, "#ffb347", 200);
        }
    }
}


// ---------- birds ----------

function spawnBird() {

    const kind = Math.random() < 0.5 ? "crow" : "bat";

    const b = {
        kind: kind,
        phase: "warn",
        timer: BIRDS.warnTime,
        x: GAME_WIDTH + 50,
        y: 0,
        width: kind === "crow" ? 38 : 34,
        height: kind === "crow" ? 24 : 26,
        vx: 0,
        vy: 0,
        flap: Math.random() * 6
    };

    if (kind === "crow") {

        // Low crow: jump over it (or swat it).
        // High crow: stay on the ground and let it pass.
        b.y = Math.random() < 0.5
            ? world.groundY - 64
            : world.groundY - 150;

        sfx.caw();
    }

    else {

        b.y = world.groundY - 230;
    }

    birds.push(b);

    // Birds come more often as the night goes on
    birdTimer =
        Math.max(
            2.5,
            Math.max(3.5, 9 - elapsed * 0.03) - NIGHT.harder.birdFaster * nightLevel()
        ) + Math.random() * 4;
}

function getBirdBox(b) {

    return {
        left: b.x + 5,
        right: b.x + b.width - 5,
        top: b.y + 4,
        bottom: b.y + b.height - 3
    };
}

function updateBirds(dt) {

    // No new birds while a tunnel is passing (you could not see them)
    if (elapsed >= BIRDS.firstAt && !tunnel && !wipe) {

        birdTimer -= dt;

        if (birdTimer <= 0) {

            if (birds.length < BIRDS.maxAtOnce) {

                spawnBird();
            }

            else {

                birdTimer = 1;
            }
        }
    }

    const playerBox = getPlayerBox();

    for (let i = birds.length - 1; i >= 0; i--) {

        const b = birds[i];

        b.flap += dt * 14;

        // The "!" shows first, the bird itself is not there yet
        if (b.phase === "warn") {

            b.timer -= dt;

            if (b.timer <= 0) {

                b.phase = "fly";

                b.vx = b.kind === "crow"
                    ? -Math.min(520, 330 + elapsed * 1.2)
                    : -300;
            }

            continue;
        }

        if (b.phase === "telegraph") {

            // Bat hovers and shakes, then locks on and dives
            b.timer -= dt;

            if (b.timer <= 0) {

                const dx = player.x + player.width / 2 - (b.x + b.width / 2);
                const dy = player.y + player.height / 2 - (b.y + b.height / 2);

                const len = Math.hypot(dx, dy) || 1;

                b.vx = (dx / len) * BIRDS.diveSpeed;
                b.vy = (dy / len) * BIRDS.diveSpeed;

                b.phase = "dive";
            }
        }

        else {

            b.x += b.vx * dt;
            b.y += b.vy * dt;

            if (b.kind === "bat" && b.phase === "fly") {

                // Slight wobble in flight
                b.y += Math.sin(b.flap * 0.4) * 40 * dt;

                if (b.x < player.x + 360) {

                    b.phase = "telegraph";
                    b.timer = BIRDS.telegraphTime;

                    sfx.screech();
                }
            }
        }

        // Gone off screen, or a bat slammed into the ground
        if (b.y + b.height > world.groundY) {

            spawnParticles(
                b.x + b.width / 2,
                world.groundY - 4,
                6,
                "#2a2a36",
                160
            );

            birds.splice(i, 1);

            continue;
        }

        if (b.x + b.width < -40) {

            birds.splice(i, 1);

            continue;
        }

        // Hit the player
        if (
            player.invulnTimer <= 0 &&
            !player.isHurt &&
            boxesOverlap(playerBox, getBirdBox(b))
        ) {

            hurtPlayer(BIRDS.stunTime);

            // The wolf closes in while you are stunned
            pushWolf(WOLF.stumble);

            addFloatText(player.x, player.y - 30, "STUNNED", "#c9a0ff");

            spawnParticles(
                b.x + b.width / 2,
                b.y + b.height / 2,
                10,
                "#1a1a22",
                240
            );

            birds.splice(i, 1);

            // Player died: stop checking
            if (state !== "playing") {
                break;
            }
        }
    }
}

// A sword swing knocks birds out of the air
function swatBirds() {

    const box = getAttackBox();

    for (let i = birds.length - 1; i >= 0; i--) {

        const b = birds[i];

        if (b.phase === "warn") {
            continue;
        }

        if (boxesOverlap(box, getBirdBox(b))) {

            birds.splice(i, 1);

            bonusPoints += 15;

            missionEvent("birds");

            sfx.smash();

            spawnParticles(
                b.x + b.width / 2,
                b.y + b.height / 2,
                10,
                "#1a1a22",
                260
            );

            addFloatText(b.x, b.y - 10, "+15", "#c9a0ff");
        }
    }
}

function drawBatWing(flap) {

    ctx.beginPath();
    ctx.moveTo(-3, -2);
    ctx.quadraticCurveTo(-8, -12 - 16 * flap, -22, -6 - 10 * flap);
    ctx.quadraticCurveTo(-14, -4, -12, 0);
    ctx.quadraticCurveTo(-8, -2, -6, 3);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();
}

// Birds are drawn in code (no image needed).
// eyesOnly = just the glowing eyes, drawn on top of the dark.
function drawBird(b, eyesOnly) {

    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;

    const flap = Math.sin(b.flap);

    ctx.save();

    ctx.translate(cx, cy);

    if (b.phase === "telegraph") {

        ctx.translate(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4
        );
    }

    // Birds face left; while diving they tilt along their path
    ctx.rotate(Math.atan2(b.vy, b.vx) - Math.PI);

    if (eyesOnly) {

        ctx.shadowColor = b.kind === "crow" ? "#ffd24a" : "#ff3b30";
        ctx.shadowBlur = 10;
        ctx.fillStyle = ctx.shadowColor;

        ctx.beginPath();

        if (b.kind === "crow") {

            ctx.arc(-16, -3, 2.2, 0, Math.PI * 2);
        }

        else {

            ctx.arc(-4, -3, 2.2, 0, Math.PI * 2);
            ctx.arc(-9, -3, 2.2, 0, Math.PI * 2);
        }

        ctx.fill();

        ctx.restore();

        return;
    }

    if (b.kind === "crow") {

        ctx.fillStyle = "#0b0b12";

        // Tail
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(23, -3);
        ctx.lineTo(23, 4);
        ctx.closePath();
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(-14, -2, 5.5, 0, Math.PI * 2);
        ctx.fill();

        // Wing
        ctx.beginPath();
        ctx.moveTo(-5, -2);
        ctx.lineTo(6, -2 - 20 * flap);
        ctx.lineTo(14, 0);
        ctx.closePath();
        ctx.fill();

        // Beak
        ctx.fillStyle = "#3d3d48";

        ctx.beginPath();
        ctx.moveTo(-18, -4);
        ctx.lineTo(-27, 0);
        ctx.lineTo(-18, 2);
        ctx.closePath();
        ctx.fill();

        // Eye
        ctx.fillStyle = "#ffd24a";

        ctx.beginPath();
        ctx.arc(-16, -3, 1.6, 0, Math.PI * 2);
        ctx.fill();
    }

    else {

        ctx.fillStyle = "#16111f";

        // Wings (one each side of the body)
        drawBatWing(flap);

        ctx.save();
        ctx.scale(-1, 1);
        drawBatWing(flap);
        ctx.restore();

        // Body
        ctx.beginPath();
        ctx.ellipse(0, 1, 6, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ears
        ctx.beginPath();
        ctx.moveTo(-5, -6);
        ctx.lineTo(-7, -13);
        ctx.lineTo(-1, -7);
        ctx.moveTo(5, -6);
        ctx.lineTo(7, -13);
        ctx.lineTo(1, -7);
        ctx.fill();

        // Eyes
        ctx.fillStyle = b.phase === "telegraph" ? "#ff3b30" : "#d95a5a";

        ctx.beginPath();
        ctx.arc(-2.5, -3, 1.5, 0, Math.PI * 2);
        ctx.arc(2.5, -3, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}


// ---------- falling logs ----------
// A shadow and a "!" show on the ground, dust trickles from above, then
// a log crashes down. You can run out of the way, or smash it with your
// sword while it falls. A log that lands stays on the ground as an
// obstacle (smash it or jump it).

const DROPS = {
    firstAt: 12,
    gapStart: 10,
    gapMin: 7,
    fallTime: 0.42,
    stun: 0.6,
    onPlayer: 0.4
};

let drops = [];
let dropTimer = 0;

function spawnDrop() {

    // Keep a new log away from nearby drop traps.
    const logSpawnX = GAME_WIDTH - 60;

    if (pits.some((p) => !p.hit && p.x + p.width > player.x - 60 && p.x < GAME_WIDTH)) {
        dropTimer = 1.0;
        return;
    }

    for (let i = 0; i < caveTraps.length; i++) {

        const t = caveTraps[i];

        if (
            t.kind === "drop" &&
            Math.abs(t.x - logSpawnX) < 340
        ) {
            dropTimer = 1.0;
            return;
        }
    }

    const kind = "log";

    const w = OBSTACLE_TYPES.log.width;
    const h = OBSTACLE_TYPES.log.height;

    const aimed = Math.random() < DROPS.onPlayer;

    // Where it will land (screen x of its centre)
    const impactX = aimed
        ? player.x + player.width / 2 + (Math.random() - 0.5) * 24
        : player.x + 190 + Math.random() * 160;

    const d = {
        kind: kind,
        x: GAME_WIDTH - 60,
        y: -120,
        w: w,
        h: h,
        impactX: impactX,
        phase: "warn",
        t: 0,
        dust: 0,
        rot: (Math.random() - 0.5) * 0.6,
        spin: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2)
    };

    drops.push(d);

    sfx.rumble();

    dropTimer =
        Math.max(DROPS.gapMin, DROPS.gapStart - elapsed * 0.04) +
        Math.random() * 4;
}

function dropBox(d) {

    return {
        left: d.x + 4,
        right: d.x + d.w - 4,
        top: d.y + 4,
        bottom: d.y + d.h
    };
}

// It breaks apart (hit something, or you smashed it)
function shatterDrop(d) {

    const cx = d.x + d.w / 2;
    const cy = d.y + d.h / 2;

    spawnParticles(cx, cy, 10, "#8a5a2b", 300);
    spawnParticles(cx, cy, 8, "#c99a5b", 280);
}

function updateDrops(dt) {

    if (
        elapsed >= DROPS.firstAt &&
        drops.length === 0 &&
        !wipe
    ) {

        dropTimer -= dt;

        if (dropTimer <= 0) {
            spawnDrop();
        }
    }

    const playerBox = getPlayerBox();

    for (let i = drops.length - 1; i >= 0; i--) {

        const d = drops[i];

        d.x -= world.scrollSpeed * dt;

        d.rot += d.spin * dt * (d.phase === "fall" ? 1 : 0);

        if (d.phase === "warn") {

            // Dust trickles from the roof above the spot
            d.dust -= dt;

            if (d.dust <= 0) {

                d.dust = 0.07;

                particles.push({
                    x: d.x + d.w / 2 + (Math.random() - 0.5) * d.w,
                    y: 0,
                    vx: (Math.random() - 0.5) * 20,
                    vy: 120 + Math.random() * 80,
                    life: 0.7,
                    max: 0.9,
                    size: 2 + Math.random() * 2,
                    color: "#8a8478"
                });
            }

            // Time to fall: it lands exactly on its spot
            if (d.x <= d.impactX + world.scrollSpeed * DROPS.fallTime) {

                d.phase = "fall";
                d.t = 0;
            }

            continue;
        }

        // Falling, speeding up
        d.t += dt;

        const p = Math.min(1, d.t / DROPS.fallTime);
        const endY = world.groundY - d.h;

        d.y = -d.h - 40 + (endY + d.h + 40) * p * p;

        // Hits the player on the way down
        if (
            player.invulnTimer <= 0 &&
            !player.isHurt &&
            boxesOverlap(playerBox, dropBox(d))
        ) {

            hurtPlayer(DROPS.stun);

            pushWolf(WOLF.stumble);

            addFloatText(player.x, player.y - 30, "CRUSHED", "#c9a0ff");

            shatterDrop(d);

            drops.splice(i, 1);

            if (state !== "playing") {
                break;
            }

            continue;
        }

        // Lands
        if (p >= 1) {

            d.y = endY;

            shake = Math.max(shake, 0.28);

            sfx.thud();

            spawnParticles(d.x + d.w / 2, world.groundY - 4, 12, "#6b6560", 240);

            if (d.kind === "log") {

                // It stays behind as an obstacle
                addObstacle("log", d.x);
            }

            else {

                shatterDrop(d);
            }

            drops.splice(i, 1);
        }
    }
}

// The sword smashes logs that have landed
function smashLogs() {

    const box = getAttackBox();

    for (let i = obstacles.length - 1; i >= 0; i--) {

        const o = obstacles[i];

        if (boxesOverlap(box, getObstacleBox(o))) {

            obstacles.splice(i, 1);

            bonusPoints += 5;

            missionEvent("logs");

            sfx.smash();

            spawnParticles(
                o.x + o.width / 2,
                o.y + o.height / 2,
                12,
                "#a8743a",
                300
            );

            addFloatText(o.x, o.y - 10, "+5", "#e8c98a");
        }
    }
}

// The sword can break a falling log
function smashDrops() {

    const box = getAttackBox();

    for (let i = drops.length - 1; i >= 0; i--) {

        const d = drops[i];

        if (d.phase !== "fall") {
            continue;
        }

        if (boxesOverlap(box, dropBox(d))) {

            shatterDrop(d);

            drops.splice(i, 1);

            bonusPoints += 10;

            missionEvent("logs");

            sfx.smash();

            addFloatText(d.x, d.y - 10, "+10", "#e8c98a");
        }
    }
}

// ---- drawing ----


function drawLogShape(w, h) {

    const r = h / 2;

    // Main body: dark, weathered bark
    ctx.fillStyle = "#302321";
    ctx.fillRect(-w / 2, -r, w, h);

    // Faint moonlit highlight along the upper edge
    ctx.fillStyle = "#49332e";
    ctx.fillRect(-w / 2, -r, w, h * 0.22);

    // Deep shadow underneath
    ctx.fillStyle = "#1b1517";
    ctx.fillRect(-w / 2, r - h * 0.28, w, h * 0.28);

    // Bark cracks
    ctx.fillStyle = "#211719";

    for (let x = -w / 2 + 8; x < w / 2 - 14; x += 11) {

        ctx.fillRect(x, -r + 4, 2, h * 0.45);
        ctx.fillRect(x + 5, r - h * 0.5, 2, h * 0.3);
    }

    // Cut end: muted, dark wood rings
    ctx.fillStyle = "#584039";

    ctx.beginPath();
    ctx.ellipse(
        w / 2 - 2, 0,
        h * 0.28, r,
        0, 0, Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = "#392823";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.ellipse(
        w / 2 - 2, 0,
        h * 0.16, r * 0.55,
        0, 0, Math.PI * 2
    );
    ctx.stroke();

    // Rounded, shadowed left end
    ctx.fillStyle = "#24191a";

    ctx.beginPath();
    ctx.ellipse(
        -w / 2 + 1, 0,
        h * 0.2, r,
        0, 0, Math.PI * 2
    );
    ctx.fill();
}


function drawDropBody(d) {

    ctx.save();

    ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
    ctx.rotate(d.rot * 0.35);

    drawLogShape(d.w, d.h);

    ctx.restore();
}

// In the scene: the falling thing itself
function drawDrops() {

    drops.forEach((d) => {

        if (d.phase === "fall") {
            drawDropBody(d);
        }
    });
}

// Above the dark: the ground shadow and the "!" so you always see it coming
function drawDropWarnings() {

    drops.forEach((d) => {

        const cx = d.x + d.w / 2;

        // How close to landing (0 = just spawned, 1 = landing)
        let near;

        if (d.phase === "fall") {

            near = 1;
        }

        else {

            const total = GAME_WIDTH - 60 - d.impactX;

            near = Math.max(0, Math.min(1, 1 - (d.x - d.impactX) / total));
        }

        // Shadow on the ground, growing darker
        ctx.save();

        ctx.fillStyle = "rgba(0, 0, 0, " + (0.25 + 0.5 * near) + ")";

        ctx.beginPath();
        ctx.ellipse(
            cx, world.groundY + 3,
            d.w * (0.45 + 0.2 * near), 7,
            0, 0, Math.PI * 2
        );
        ctx.fill();

        // A line from the roof, so you know it is coming from above
        if (d.phase === "warn") {

            ctx.globalAlpha = 0.25;
            ctx.fillStyle = "#ff5a4a";
            ctx.fillRect(cx - 1, 0, 2, world.groundY - 110);
        }

        ctx.restore();

        if (d.phase === "warn") {

            drawWarningSign(cx, world.groundY - 80, 44);
        }

        // Still visible through the dark while it falls
        if (d.phase === "fall" && darknessLevel() > 0.25) {

            ctx.save();
            ctx.globalAlpha = 0.55;

            drawDropBody(d);

            ctx.restore();
        }
    });
}

const warningSprite = loadImage("assets/images/ui/warning.png");

// The warning triangle. (x, y) is its centre, size is its width.
function drawWarningSign(x, y, size) {

    ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(time * 9));

    if (ready(warningSprite)) {

        const h = size * (warningSprite.naturalHeight / warningSprite.naturalWidth);

        ctx.drawImage(warningSprite, x - size / 2, y - h / 2, size, h);
    }

    else {

        drawText("!", x, y + 13, 38, "center", "#ff5a4a");
    }

    ctx.globalAlpha = 1;
}

// ========================================
// CAVE TRAPS (stalactites and drop traps)
// ========================================
// These only appear while you run through the cave tunnel
// (falling logs only appear outside it).
// Stalactite: hangs from the ceiling, shakes (warning sign), then drops.
//             Step out from under it.
// Drop trap:  a plank in the floor that flips open into a pit.
//             Jump the pit (standing in it costs a heart).

const CAVE_TRAPS = {

    gapMin: 4.5,           // seconds between traps inside the cave
    gapMax: 6.5,

    // Stalactite sprite: 4 cells of 80 x 130 (hang, shake, fall, broken)
    stalCellW: 80,
    stalCellH: 130,
    stalScale: 0.8,
    ceilingY: 30,          // where stalactites hang from
    shakeTime: 0.7,        // shake time before it drops
    fallGravity: 2400,

    // Drop trap sprite: 4 cells of 134 x 104 (closed, then 3 opening frames)
    dropCellW: 134,
    dropCellH: 104,
    dropScale: 0.7,
    openWarn: 0.45,        // the plank shakes this long before it flips
    openAnim: 0.25
};

const stalactiteSprite = loadImage("assets/images/traps/stalactite.png");
const dropTrapSprite = loadImage("assets/images/traps/drop_traps.png");

let caveTraps = [];
let caveTrapTimer = 0.6;

// Is this screen x deep inside the cave (not on the soft edge of the mouth)?
function insideCave(x) {

    if (!tunnel) {
        return false;
    }

    const u = x - tunnel.x;

    return u > TUNNEL.mouth && u < TUNNEL.length - TUNNEL.mouth;
}

function spawnCaveTrap() {

    const x = GAME_WIDTH + 60;

    const inCave = insideCave(x);

    const kind = inCave
        ? (Math.random() < 0.5 ? "stalactite" : "drop")
        : "drop";

    // Keep drop traps away from landed and falling logs.
    if (kind === "drop") {

        for (let i = 0; i < pits.length; i++) {
            if (Math.abs(pits[i].x - x) < PITS.spacing) {
                return false;
            }
        }

        // Check landed obstacles.
        for (let i = 0; i < obstacles.length; i++) {

            if (obstacles[i].x > GAME_WIDTH - 340) {
                return false;
            }
        }

        // Also check logs that are still falling.
        for (let i = 0; i < drops.length; i++) {

            const d = drops[i];

            if (
                d.kind === "log" &&
                Math.abs(d.x - x) < 340
            ) {
                return false;
            }
        }
    }

    const S = CAVE_TRAPS;

    if (kind === "stalactite") {

        caveTraps.push({
            kind: "stalactite",
            phase: "hang",            // hang -> shake -> fall -> broken
            timer: 0,
            x: x,
            y: S.ceilingY,
            vy: 0,
            width: S.stalCellW * S.stalScale,
            height: S.stalCellH * S.stalScale,
            // where it lands compared with you (not always dead centre)
            aim: -40 + Math.random() * 100
        });
    }

    else {

        caveTraps.push({
            kind: "drop",
            phase: "armed",           // armed -> warn -> open
            timer: 0,
            openTime: 0,
            hit: false,
            x: x,
            y: 0,
            width: S.dropCellW * S.dropScale,
            height: S.dropCellH * S.dropScale
        });
    }

    return true;
}

function getStalactiteBox(t) {

    // Just the spike: a narrow strip down the middle of the sprite
    return {
        left: t.x + t.width * 0.3,
        right: t.x + t.width * 0.7,
        top: t.y + t.height * 0.1,
        bottom: t.y + t.height * 0.95
    };
}

function updateStalactite(t, dt, px, playerBox) {

    const S = CAVE_TRAPS;

    if (t.phase === "hang") {

        // Starts to shake so that it lands about where you will be
        const reach = world.scrollSpeed * (S.shakeTime + 0.55) + t.aim;

        if (t.x + t.width / 2 - px < reach) {

            t.phase = "shake";
            t.timer = S.shakeTime;

            noise(0.5, 0.15, 500);
        }
    }

    else if (t.phase === "shake") {

        t.timer -= dt;

        // Little bits of rock fall off
        if (Math.random() < dt * 14) {

            spawnParticles(
                t.x + t.width / 2,
                t.y + t.height * 0.3,
                1,
                "#8b8d96",
                80
            );
        }

        if (t.timer <= 0) {

            t.phase = "fall";
            t.vy = 0;
        }
    }

    else if (t.phase === "fall") {

        t.vy += S.fallGravity * dt;
        t.y += t.vy * dt;

        let landed = t.y + t.height >= world.groundY;

        if (
            player.invulnTimer <= 0 &&
            !player.isHurt &&
            boxesOverlap(playerBox, getStalactiteBox(t))
        ) {

            hurtPlayer();

            pushWolf(WOLF.stumble);

            landed = true;
        }

        if (landed) {

            t.phase = "broken";
            t.timer = 1.2;
            t.y = world.groundY - t.height;

            shake = Math.max(shake, 0.2);

            noise(0.25, 0.25, 700);

            spawnParticles(
                t.x + t.width / 2,
                world.groundY - 4,
                10,
                "#8b8d96",
                240
            );
        }
    }

    else {

        // The broken pieces lie there for a moment, then vanish
        t.timer -= dt;

        if (t.timer <= 0) {
            t.done = true;
        }
    }
}

function updateDropTrap(t, dt, px, playerBox) {

    const S = CAVE_TRAPS;

    if (t.phase === "armed") {

        // Flips open a little before you get there
        if (t.x - px < world.scrollSpeed * (S.openWarn + 0.45)) {

            t.phase = "warn";
            t.timer = S.openWarn;

            tone(180, 0.25, "square", 0.07, 120);
        }
    }

    else if (t.phase === "warn") {

        t.timer -= dt;

        if (t.timer <= 0) {

            t.phase = "open";
            t.openTime = 0;

            noise(0.2, 0.25, 600);
        }
    }

    else {

        t.openTime += dt;

        // The pit only catches you on the ground (jump it!)
        const onTrap =
            playerBox.bottom >= world.groundY - 8 &&
            playerBox.right > t.x + t.width * 0.12 &&
            playerBox.left < t.x + t.width * 0.88;

        if (
            onTrap &&
            !t.hit &&
            player.invulnTimer <= 0 &&
            !player.isHurt
        ) {

            t.hit = true;

            hurtPlayer();

            pushWolf(WOLF.stumble);

            addFloatText(player.x, player.y - 30, "CAUGHT!", "#ff7777");

        }
    }
}

function updateCaveTraps(dt) {

    // Regular drop traps can spawn outside caves.
    // Stalactites remain exclusive to caves.
    const canSpawn =
        !tunnel || insideCave(GAME_WIDTH + 60);

    if (canSpawn) {

        caveTrapTimer -= dt;

        if (caveTrapTimer <= 0) {

            caveTrapTimer = spawnCaveTrap()
                ? CAVE_TRAPS.gapMin +
                  Math.random() *
                  (CAVE_TRAPS.gapMax - CAVE_TRAPS.gapMin)
                : 0.4;
        }
    }

    else {
        // Wait until the cave entrance has passed.
        caveTrapTimer = 0.6;
    }

    const playerBox = getPlayerBox();
    const px = player.x + player.width / 2;

    for (let i = caveTraps.length - 1; i >= 0; i--) {

        const t = caveTraps[i];

        t.x -= world.scrollSpeed * dt;

        if (t.x + t.width < -40) {

            caveTraps.splice(i, 1);

            continue;
        }

        if (t.kind === "stalactite") {
            updateStalactite(t, dt, px, playerBox);
        }

        else {
            updateDropTrap(t, dt, px, playerBox);
        }

        if (t.done) {
            caveTraps.splice(i, 1);
        }

        // Player died: stop checking
        if (state !== "playing") {
            break;
        }
    }
}

function drawCaveTrap(t) {

    const S = CAVE_TRAPS;

    // ---------- stalactite ----------
    if (t.kind === "stalactite") {

        const frame = { hang: 0, shake: 1, fall: 2, broken: 3 }[t.phase];

        let x = t.x;
        const y = t.phase === "broken" ? world.groundY - t.height : t.y;

        if (t.phase === "shake") {
            x += (Math.random() - 0.5) * 4;
        }

        ctx.globalAlpha =
            t.phase === "broken" ? Math.min(1, t.timer * 2) : 1;

        if (ready(stalactiteSprite)) {

            ctx.drawImage(
                stalactiteSprite,
                frame * S.stalCellW, 0, S.stalCellW, S.stalCellH,
                x, y, t.width, t.height
            );
        }

        else {

            // No picture: a grey spike
            ctx.fillStyle = "#8b8d96";

            ctx.beginPath();
            ctx.moveTo(x + t.width * 0.2, y);
            ctx.lineTo(x + t.width * 0.8, y);
            ctx.lineTo(x + t.width / 2, y + t.height);
            ctx.closePath();
            ctx.fill();
        }

        ctx.globalAlpha = 1;

        return;
    }

    // ---------- drop trap ----------
    const open = t.phase === "open";

    let frame = 0;

    if (open) {

        frame = 1 + Math.min(2, Math.floor((t.openTime / S.openAnim) * 3));
    }

    let x = t.x;

    if (t.phase === "warn") {
        x += (Math.random() - 0.5) * 3;
    }


    if (ready(dropTrapSprite)) {

        // The bottom of the picture sits just under the ground line
        ctx.drawImage(
            dropTrapSprite,
            frame * S.dropCellW, 0, S.dropCellW, S.dropCellH,
            x, world.groundY + 10 - t.height, t.width, t.height
        );
    }

    else if (!open) {

        // No picture: a plank in the floor
        ctx.fillStyle = "#8a5a2b";
        ctx.fillRect(x, world.groundY - 2, t.width, 10);
    }
}

// Warning signs for the traps (drawn on top of the dark)
function drawCaveTrapWarnings() {

    caveTraps.forEach((t) => {

        if (t.kind === "stalactite" && t.phase === "shake") {

            drawWarningSign(t.x + t.width / 2, world.groundY - 46, 38);
        }
    });
}

// ---------- drawing the dark ----------

function drawDarkness() {

    const dark = darknessLevel();

    if (dark <= 0.01) {
        return;
    }

    const g = darkCtx;

    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    g.fillStyle = "rgba(2, 3, 10, " + dark + ")";
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // The light follows the player, so it shows both ahead and behind
    const cx = player.x + player.width / 2 + 10;
    const cy = player.y + player.height / 2 - 10;

    const r = torchRadius();

    g.globalCompositeOperation = "destination-out";

    const hole = g.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);

    hole.addColorStop(0, "rgba(0, 0, 0, 1)");
    hole.addColorStop(0.55, "rgba(0, 0, 0, 0.85)");
    hole.addColorStop(1, "rgba(0, 0, 0, 0)");

    g.fillStyle = hole;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);

    g.globalCompositeOperation = "source-over";

    ctx.drawImage(darkLayer, 0, 0);

    // Warm glow inside the light
    const warm = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);

    const strength = 0.2 * (dark / NIGHT.maxDarkness);

    warm.addColorStop(0, "rgba(255, 170, 70, " + strength + ")");
    warm.addColorStop(1, "rgba(255, 170, 70, 0)");

    ctx.save();

    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = warm;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    ctx.restore();
}

function drawFuel(f) {

    const y = f.y + Math.sin(time * 4 + f.bob) * 3;

    const cx = f.x + f.width / 2;
    const cy = y + f.height / 2;

    // Glow
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34);

    glow.addColorStop(0, "rgba(255, 170, 70, 0.55)");
    glow.addColorStop(1, "rgba(255, 170, 70, 0)");

    ctx.fillStyle = glow;
    ctx.fillRect(cx - 34, cy - 34, 68, 68);

    // Cork + neck
    ctx.fillStyle = "#8a5a2b";
    ctx.fillRect(f.x + 8, y, 10, 6);

    ctx.fillStyle = "#c9c2a8";
    ctx.fillRect(f.x + 9, y + 6, 8, 6);

    // Body
    ctx.fillStyle = "#c46a1c";

    ctx.beginPath();
    ctx.ellipse(cx, y + 26, 13, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shine
    ctx.fillStyle = "#ffd27a";

    ctx.beginPath();
    ctx.ellipse(cx - 4, y + 22, 3, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
}

function drawTorchFlame() {

    // Held out in front of the player
    const fx = player.x + 88;
    const fy = player.y - 2;

    const flick = torchFlicker();

    const strength =
        (0.35 + 0.65 * Math.min(1, torch.fuel / NIGHT.lowFuel)) *
        (0.5 + 0.5 * flick);

    const wobble = Math.sin(time * 18) * 1.5;

    // Stick
    ctx.fillStyle = "#5a3a1c";
    ctx.fillRect(fx - 1, fy + 6, 4, 20);

    ctx.save();

    ctx.shadowColor = "#ff9a3c";
    ctx.shadowBlur = 14 * strength;

    ctx.fillStyle = "#ff8a1f";

    ctx.beginPath();
    ctx.ellipse(
        fx + 1, fy + 2,
        (5 + wobble * 0.3) * strength, (10 + wobble) * strength,
        0, 0, Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = "#ffe07a";

    ctx.beginPath();
    ctx.ellipse(
        fx + 1, fy + 4,
        2.5 * strength, 5.5 * strength,
        0, 0, Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
}



// Things that stay visible in the dark: warnings, glowing eyes,
// oil flasks and the torch itself
function drawNightExtras() {

    if (state === "loading" || state === "intro" || state === "menu") {
        return;
    }

    const dark = darknessLevel();

    // Warning signs at the edge of the screen
    birds.forEach((b) => {

        if (b.phase === "warn") {

            drawWarningSign(GAME_WIDTH - 40, b.y + b.height / 2, 44);
        }
    });

    // Glowing eyes so birds can be seen coming in the dark
    if (dark > 0.25) {

        birds.forEach((b) => {

            if (b.phase !== "warn") {
                drawBird(b, true);
            }
        });
    }

    // Moon shards glow faintly through the dark
    if (dark > 0.25) {

        shards.forEach((l) => {
            drawShard(l.x, l.y, l.width, l.height, l.phase, true);
        });
    }

    fuels.forEach(drawFuel);

    drawDropWarnings();
    drawCaveTrapWarnings();

    if (dark > 0.25) drawPitGlows();

    // Big sign: it is about to pounce. Small sign: one more stumble and it will.
    if (werewolf.windup > 0) {
        drawWarningSign(werewolf.x + 64, werewolf.y - 70, 36);
    }

    else if (werewolf.threatTimer > 0 && state === "playing") {
        drawWarningSign(werewolf.x + 64, werewolf.y - 70, 26);
    }

    if (dark > 0.05 && state !== "gameover") {
        drawTorchFlame();
    }
}


// ========================================
// EFFECTS (particles, floating text, shake)
// ========================================

let particles = [];
let floatTexts = [];

let shake = 0;
let flash = 0;

let time = 0;

function spawnParticles(x, y, count, color, power) {

    for (let i = 0; i < count; i++) {

        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * power,
            vy: -Math.random() * power * 0.8,
            life: 0.5 + Math.random() * 0.4,
            max: 0.9,
            size: 2 + Math.random() * 4,
            color: color
        });
    }
}

function addFloatText(x, y, text, color) {

    floatTexts.push({
        x: x,
        y: y,
        text: text,
        color: color || "#ffffff",
        life: 1
    });
}


// ========================================
// SOUND (generated with Web Audio, no files needed)
// ========================================

const audio = {
    ctx: null,
    master: null,
    muted: false,

    ambientNodes: null,
    howlTimer: 12
};

try {
    audio.muted = localStorage.getItem("untilDawn.muted") === "1";
} catch (e) { /* ignore */ }

function initAudio() {

    if (audio.ctx) {
        return;
    }

    const AC = window.AudioContext || window.webkitAudioContext;

    if (!AC) {
        return;
    }

    audio.ctx = new AC();

    audio.master = audio.ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.5;
    audio.master.connect(audio.ctx.destination);
}

function resumeAudio() {

    if (audio.ctx && audio.ctx.state === "suspended") {
        audio.ctx.resume();
    }
}

function updateMuteButton() {

    ui.muteBtn.textContent =
        audio.muted ? "SOUND: OFF" : "SOUND: ON";
}

function toggleMute() {

    audio.muted = !audio.muted;

    if (audio.master) {
        audio.master.gain.value = audio.muted ? 0 : 0.5;
    }

    try {
        localStorage.setItem(
            "untilDawn.muted",
            audio.muted ? "1" : "0"
        );
    } catch (e) { /* ignore */ }

    updateMuteButton();
}

function tone(freq, dur, type, vol, slideTo, delay) {

    if (!audio.ctx) {
        return;
    }

    const t = audio.ctx.currentTime + (delay || 0);

    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();

    osc.type = type || "square";

    osc.frequency.setValueAtTime(freq, t);

    if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(
            slideTo,
            t + dur
        );
    }

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(audio.master);

    osc.start(t);
    osc.stop(t + dur + 0.02);
}

function noiseBuffer(seconds, fade) {

    const length = Math.floor(audio.ctx.sampleRate * seconds);

    const buffer = audio.ctx.createBuffer(
        1,
        length,
        audio.ctx.sampleRate
    );

    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {

        data[i] =
            (Math.random() * 2 - 1) *
            (fade ? 1 - i / length : 1);
    }

    return buffer;
}

function noise(dur, vol, filterFreq) {

    if (!audio.ctx) {
        return;
    }

    const src = audio.ctx.createBufferSource();

    src.buffer = noiseBuffer(dur, true);

    const filter = audio.ctx.createBiquadFilter();

    filter.type = "lowpass";
    filter.frequency.value = filterFreq || 1200;

    const gain = audio.ctx.createGain();

    gain.gain.value = vol;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);

    src.start();
}

function howl() {

    if (!audio.ctx) {
        return;
    }

    const t = audio.ctx.currentTime;

    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();

    osc.type = "sine";

    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.8);
    osc.frequency.exponentialRampToValueAtTime(340, t + 1.9);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2);

    osc.connect(gain);
    gain.connect(audio.master);

    osc.start(t);
    osc.stop(t + 2.1);
}

const sfx = {

    burst() {
        noise(0.35, 0.12, 2800);
        tone(500, 0.6, "sine", 0.2, 1300);
        tone(900, 0.5, "triangle", 0.14, 300, 0.05);
    },

    pit() {
        noise(0.4, 0.3, 500);
        tone(320, 0.5, "sine", 0.16, 50);
    },

    jump() {
        tone(260, 0.18, "square", 0.1, 520);
    },

    land() {
        noise(0.06, 0.1, 500);
    },

    attack() {
        noise(0.12, 0.16, 3000);
        tone(400, 0.1, "sawtooth", 0.05, 150);
    },

    hit() {
        noise(0.25, 0.35, 900);
        tone(140, 0.3, "sawtooth", 0.18, 50);
    },

    collect() {
        tone(660, 0.08, "triangle", 0.18);
        tone(990, 0.12, "triangle", 0.18, null, 0.07);
    },

    smash() {
        noise(0.2, 0.3, 1800);
        tone(200, 0.12, "square", 0.08, 90);
    },

    parry() {
        tone(880, 0.1, "square", 0.12);
        tone(1320, 0.15, "square", 0.12, null, 0.08);
    },

    heal() {
        tone(523, 0.1, "triangle", 0.2);
        tone(659, 0.1, "triangle", 0.2, null, 0.1);
        tone(784, 0.2, "triangle", 0.2, null, 0.2);
    },

    growl() {
        tone(90, 0.35, "sawtooth", 0.1, 60);
        noise(0.3, 0.07, 400);
    },

    // Something heavy lands
    thud() {
        noise(0.3, 0.4, 260);
        tone(75, 0.3, "sine", 0.28, 32);
    },

    // The roof groans just before a log falls
    rumble() {
        noise(0.55, 0.14, 180);
        tone(55, 0.5, "sawtooth", 0.06, 40);
    },

    caw() {
        tone(520, 0.12, "sawtooth", 0.07, 300);
        tone(480, 0.14, "sawtooth", 0.07, 260, 0.14);
    },

    screech() {
        tone(1800, 0.25, "square", 0.05, 2600);
        noise(0.15, 0.05, 3500);
    },

    ignite() {
        noise(0.15, 0.12, 2500);
        tone(300, 0.15, "triangle", 0.12, 600);
    },

    mission() {
        tone(523, 0.1, "triangle", 0.2);
        tone(659, 0.1, "triangle", 0.2, null, 0.09);
        tone(784, 0.1, "triangle", 0.2, null, 0.18);
        tone(1047, 0.25, "triangle", 0.2, null, 0.27);
    },

    levelup() {
        tone(784, 0.12, "triangle", 0.2, null, 0.5);
        tone(988, 0.12, "triangle", 0.2, null, 0.62);
        tone(1319, 0.4, "triangle", 0.2, null, 0.74);
    },

    tunnel() {
        noise(0.8, 0.1, 600);
        tone(130, 0.8, "sine", 0.07, 80);
    },

    gameOver() {
        tone(220, 0.5, "sawtooth", 0.18, 55);
        tone(165, 0.9, "triangle", 0.18, 40, 0.3);
    }
};

function startAmbient() {

    if (!audio.ctx || audio.ambientNodes) {
        return;
    }

    // Low looping wind
    const src = audio.ctx.createBufferSource();

    src.buffer = noiseBuffer(3, false);
    src.loop = true;

    const filter = audio.ctx.createBiquadFilter();

    filter.type = "lowpass";
    filter.frequency.value = 380;

    const gain = audio.ctx.createGain();

    gain.gain.value = 0.05;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);

    src.start();

    audio.ambientNodes = { src: src, gain: gain };
    audio.howlTimer = 8 + Math.random() * 8;
}

function stopAmbient() {

    if (!audio.ambientNodes) {
        return;
    }

    try {
        audio.ambientNodes.src.stop();
    } catch (e) { /* already stopped */ }

    audio.ambientNodes = null;
}


// ========================================
// BACKGROUND (drawn in code, no images needed)
// ========================================

function makeCanvas(w, h) {

    const c = document.createElement("canvas");

    c.width = w;
    c.height = h;

    return c;
}

function seededRandom(seed) {

    let s = seed;

    return function () {

        s = (s * 16807) % 2147483647;

        return (s - 1) / 2147483646;
    };
}

function drawPine(g, x, baseY, w, h) {

    // Trunk
    g.fillRect(
        x - w * 0.06,
        baseY - h * 0.14,
        w * 0.12,
        h * 0.14
    );

    // Three tiers of branches
    for (let t = 0; t < 3; t++) {

        const top = baseY - h + t * h * 0.26;
        const bottom = top + h * 0.42;
        const half = w * (0.45 + 0.27 * t);

        g.beginPath();
        g.moveTo(x, top);
        g.lineTo(x - half, bottom);
        g.lineTo(x + half, bottom);
        g.closePath();
        g.fill();
    }
}

function makeTreeLayer(seed, count, minH, maxH, color) {

    const c = makeCanvas(GAME_WIDTH, GAME_HEIGHT);
    const g = c.getContext("2d");

    const rnd = seededRandom(seed);

    g.fillStyle = color;

    for (let i = 0; i < count; i++) {

        const x = rnd() * GAME_WIDTH;
        const h = minH + rnd() * (maxH - minH);
        const w = h * 0.34;

        drawPine(g, x, world.groundY, w, h);

        // Wrap around so the layer tiles without a seam
        if (x < w) {
            drawPine(g, x + GAME_WIDTH, world.groundY, w, h);
        }

        if (x > GAME_WIDTH - w) {
            drawPine(g, x - GAME_WIDTH, world.groundY, w, h);
        }
    }

    g.fillRect(
        0,
        world.groundY - 2,
        GAME_WIDTH,
        GAME_HEIGHT - world.groundY + 2
    );

    return c;
}

const bg = {

    sky: null,
    farTrees: makeTreeLayer(11, 16, 150, 250, "#0c1626"),
    midTrees: makeTreeLayer(23, 10, 200, 310, "#08101c"),
    nearTrees: makeTreeLayer(37, 6, 260, 380, "#04070e"),
    vignette: null,

    picX: 0,
    farX: 0,
    midX: 0,
    nearX: 0,
    groundX: 0,
    fogX: 0,

    stars: []
};

// Sky gradient + moon (pre-rendered once)
(function buildSky() {

    const c = makeCanvas(GAME_WIDTH, GAME_HEIGHT);
    const g = c.getContext("2d");

    const sky = g.createLinearGradient(0, 0, 0, world.groundY);

    sky.addColorStop(0, "#03040c");
    sky.addColorStop(0.6, "#0b1430");
    sky.addColorStop(1, "#1b2547");

    g.fillStyle = sky;
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Moon glow
    const mx = 770;
    const my = 105;

    const glow = g.createRadialGradient(mx, my, 20, mx, my, 190);

    glow.addColorStop(0, "rgba(190, 205, 255, 0.35)");
    glow.addColorStop(1, "rgba(190, 205, 255, 0)");

    g.fillStyle = glow;
    g.fillRect(mx - 200, my - 200, 400, 400);

    // Moon
    g.fillStyle = "#e6ebff";
    g.beginPath();
    g.arc(mx, my, 40, 0, Math.PI * 2);
    g.fill();

    // Craters
    g.fillStyle = "rgba(150, 160, 200, 0.45)";

    [[-12, -8, 9], [14, 6, 7], [-4, 16, 5], [10, -18, 4]]
        .forEach(function (cr) {

            g.beginPath();
            g.arc(mx + cr[0], my + cr[1], cr[2], 0, Math.PI * 2);
            g.fill();
        });

    bg.sky = c;
})();

// Stars
(function buildStars() {

    const rnd = seededRandom(5);

    for (let i = 0; i < 80; i++) {

        bg.stars.push({
            x: rnd() * GAME_WIDTH,
            y: rnd() * (world.groundY - 180),
            r: 0.6 + rnd() * 1.4,
            phase: rnd() * Math.PI * 2
        });
    }
})();

// Dark edges
(function buildVignette() {

    const c = makeCanvas(GAME_WIDTH, GAME_HEIGHT);
    const g = c.getContext("2d");

    const grad = g.createRadialGradient(
        GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT * 0.35,
        GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.62
    );

    grad.addColorStop(0, "rgba(0, 0, 0, 0)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0.6)");

    g.fillStyle = grad;
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    bg.vignette = c;
})();

function updateBackground(dt, speed) {

    bg.picX += speed * BACKDROP_SPEED * dt;
    bg.farX += speed * 0.1 * dt;
    bg.midX += speed * 0.25 * dt;
    bg.nearX += speed * 0.5 * dt;
    bg.groundX += speed * dt;

    // Fog drifts even when the world is frozen
    bg.fogX += (20 + speed * 0.05) * dt;
}

function drawTiled(img, offset) {

    const x = -(offset % GAME_WIDTH);

    ctx.drawImage(img, x, 0);
    ctx.drawImage(img, x + GAME_WIDTH, 0);
}

// ----------------------------------------
// BACKDROPS: the picture backgrounds (assets/images/backgrounds/)
// ----------------------------------------

//
// A picture that is missing is fine: the game uses the forest drawn in code
// instead, and if only one or two pictures exist it uses just those.
//
// How it moves (parallax: far things slide slowly, near things fast):
//   the picture            slow
//   dark trees in front    faster
//   the ground             full speed
//   fog                    drifts by itself
// The picture is flipped on every other copy, so it loops with no seam.
//
//   groundAt  how far down the picture the ground starts (0.83 = 83%).
//             The picture is lined up so that spot meets the game's ground.
//   dim       darken the picture a little (0 to 1) so the player stays easy
//             to see against bright art.
//   front     what slides past in front of the picture, or null for nothing:
//             { kind: "trunks" or "pines", color, seed }
//   ground    colours of the ground strip in this scene.

const BACKDROPS = {

    moon: {
        img: loadImage("assets/images/backgrounds/moon_full.jpg"),
        groundAt: 0.9,
        dim: 0.05,
        front: null,
        ground: { dirt: "#0b0719", grass: "#150f2a", edge: "#2a2147", mark: "#07040f" }
    },

    cloudsBlue: {
        img: loadImage("assets/images/backgrounds/clouds_blue.jpg"),
        groundAt: 0.86,
        dim: 0.1,
        front: null,
        ground: { dirt: "#100c22", grass: "#0b1a44", edge: "#1a3a8a", mark: "#0a0818" }
    },

    cloudsGrey: {
        img: loadImage("assets/images/backgrounds/clouds_grey.jpg"),
        groundAt: 0.93,
        dim: 0.3,
        front: null,
        ground: { dirt: "#23243a", grass: "#363a5c", edge: "#5b6090", mark: "#1a1b2d" }
    },

    night: {
        img: loadImage("assets/images/backgrounds/forest_night.png"),
        groundAt: 0.83,
        dim: 0.25,
        front: { kind: "trunks", color: "#1d1330", seed: 7 },
        ground: { dirt: "#26193c", grass: "#201533", edge: "#38326a", mark: "#1d1230" }
    },

    dawn: {
        img: loadImage("assets/images/backgrounds/forest_dawn.png"),
        groundAt: 0.93,
        dim: 0.1,
        front: { kind: "trunks", color: "#1d182e", seed: 19 },
        ground: { dirt: "#002e2e", grass: "#0f4a3d", edge: "#1f6b4a", mark: "#00201f" }
    }
};

// Which pictures can come up at random. The dawn picture is not in this
// list: it comes at the start of every dawn, then a night picture returns.
const BACKDROP_RANDOM = {
    pool: ["moon", "night", "cloudsBlue", "cloudsGrey"],
    firstChange: 22,   // seconds into the run for the first swap
    every: 28          // seconds between swaps after that
};

// The tunnel: a dark passage (roof, dim trees, fireflies) that comes along
// from the right and covers the whole screen for a moment. The picture is
// swapped while it covers the screen, and you run out into the new place.
const TUNNEL = {
    length: 2700,    // pixels long (about three screens)
    mouth: 430,      // pixels over which the cave fades in and out (longer = softer)
    roof: 175,       // how low the roof hangs inside (y of its underside)
    lead: 4.0        // it starts coming this many seconds before the change
};

// The cave you run through inside the tunnel: four pictures stacked, each one
// sliding past at its own speed (far = slow, near = fast) so it has depth.
// If the files are missing the old dark passage is drawn instead.
const CAVE = {
    sky:   { img: loadImage("assets/images/backgrounds/cave_sky.png"),   speed: 0.12 },
    mid:   { img: loadImage("assets/images/backgrounds/cave_mid.png"),   speed: 0.35 },
    front: { img: loadImage("assets/images/backgrounds/cave_front.png"), speed: 0.7 },
    floor: { img: loadImage("assets/images/backgrounds/cave_floor.png"), speed: 1 },
    floorColor: "#0a0e17",
    roofColor: "#0c1117"
};

let caveFrame = null;

function caveReady() {

    return ["sky", "mid", "front", "floor"].every((k) => ready(CAVE[k].img));
}

// Each picture stretched to the game size, once
function caveArt(layer) {

    if (!layer.art) {

        const c = makeCanvas(GAME_WIDTH, GAME_HEIGHT);
        const g = c.getContext("2d");

        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        g.drawImage(layer.img, 0, 0, GAME_WIDTH, GAME_HEIGHT);

        layer.art = c;
    }

    return layer.art;
}

// One full screen of cave for the distance travelled so far
function drawCaveFrame(travel) {

    if (!caveFrame) {
        caveFrame = makeCanvas(GAME_WIDTH, GAME_HEIGHT);
    }

    const g = caveFrame.getContext("2d");

    g.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    drawBackdropLoop(caveArt(CAVE.sky), travel * CAVE.sky.speed, g);
    drawBackdropLoop(caveArt(CAVE.mid), travel * CAVE.mid.speed, g);
    drawBackdropLoop(caveArt(CAVE.front), travel * CAVE.front.speed, g);

    // The floor moves exactly like the ground, so running feels right
    g.fillStyle = CAVE.floorColor;
    g.fillRect(0, world.groundY, GAME_WIDTH, GAME_HEIGHT - world.groundY);

    drawBackdropLoop(caveArt(CAVE.floor), travel * CAVE.floor.speed, g);
}

// How one place turns into the next.
//   "mist"  = a bank of clouds rolls over the screen, the picture changes
//             behind it, and you run out the other side into the new place.
//   "cave"  = the cave tunnel above
const TRANSITION = {
    mode: "cave",
    length: 2400,    // how long the cloud bank is (px)
    soft: 420,       // the puffy, thinning zone at each end of the bank (px)
    speed: 1.1,      // bank speed compared with the ground
    head: 3.4,       // seconds BEFORE the "at" time that the bank appears
    colors: ["#30365c", "#3b4270", "#4a5282", "#5f689a"]   // dark -> light
};

let wipe = null;           // the bank on its way, or null
let mistBank = null;       // the pre-drawn clouds

let backdropId = null;       // the picture showing now (picked when first needed)
let nextBackdropId = null;   // the picture the cave is bringing
let nextChangeAt = 0;        // run time of the next random swap
let dawnShown = 0;     // the last night whose dawn picture came
let dawnTarget = 0;    // the dawn the tunnel on its way is bringing
let tunnel = null;       // the tunnel on its way, or null
let tunnelDeco = null;   // dim trees inside the tunnel (made once)

// How fast the picture slides, compared with the world speed
const BACKDROP_SPEED = 0.1;

// Ground colours used with the forest drawn in code
const CODE_GROUND = {
    dirt: "#14141c",
    grass: "#223025",
    edge: "#2f4332",
    mark: "#0d0d13"
};

// The picture, scaled to fit the game and lined up on the ground (made once,
// the first time it is needed). null while the file is missing or loading.
function backdropArt(cfg) {

    if (cfg.art) {
        return cfg.art;
    }

    if (!ready(cfg.img)) {
        return null;
    }

    const iw = cfg.img.naturalWidth;
    const ih = cfg.img.naturalHeight;

    // Wide enough to fill the screen, and big enough that the picture's
    // ground line can reach the game's ground line
    const scale = Math.max(
        GAME_WIDTH / iw,
        world.groundY / (cfg.groundAt * ih)
    );

    const w = iw * scale;
    const h = ih * scale;

    // If the picture's ground would sit below the game's ground,
    // slide the picture up until they meet
    const dy = Math.min(0, world.groundY - cfg.groundAt * h);

    const c = makeCanvas(GAME_WIDTH, GAME_HEIGHT);
    const g = c.getContext("2d");

    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";

    g.drawImage(cfg.img, (GAME_WIDTH - w) / 2, dy, w, h);

    cfg.art = c;

    return c;
}

// Tall dark trunks that slide past in front of the picture.
// Drawn in steps of a few pixels so they match the pixel-art look.
function makeTrunkLayer(seed, color) {

    const c = makeCanvas(GAME_WIDTH, GAME_HEIGHT);
    const g = c.getContext("2d");

    const rnd = seededRandom(seed);

    const count = 4;
    const step = 6;

    g.fillStyle = color;

    for (let i = 0; i < count; i++) {

        // One in each quarter of the screen, so they never bunch up
        const x = ((i + 0.2 + rnd() * 0.6) / count) * GAME_WIDTH;
        const w = 20 + Math.floor(rnd() * 24);

        // Two short branches
        const branches = [
            { y: 90 + rnd() * 90, dir: rnd() < 0.5 ? -1 : 1, len: 30 + rnd() * 24 },
            { y: 230 + rnd() * 80, dir: rnd() < 0.5 ? -1 : 1, len: 24 + rnd() * 20 }
        ];

        const drawTrunk = (cx) => {

            for (let y = 0; y < world.groundY + 6; y += step) {

                // Slightly wider toward the bottom, flaring into roots
                let half = (w / 2) * (0.82 + 0.18 * (y / world.groundY));

                if (y > world.groundY - 40) {
                    half += (y - (world.groundY - 40)) * 0.45;
                }

                // A little wobble along the edges
                half += ((Math.floor(y / step) * 37 + i * 11) % 3) - 1;

                g.fillRect(
                    Math.round(cx - half),
                    y,
                    Math.round(half * 2),
                    step
                );
            }

            branches.forEach((b) => {

                for (let s = 0; s < b.len; s += step) {

                    g.fillRect(
                        Math.round(cx + b.dir * (w / 2 + s)),
                        Math.round(b.y - s * 0.6),
                        step,
                        step
                    );
                }
            });
        };

        drawTrunk(x);

        // Wrap around so the layer loops without a seam
        if (x < w + 60) {
            drawTrunk(x + GAME_WIDTH);
        }

        if (x > GAME_WIDTH - w - 60) {
            drawTrunk(x - GAME_WIDTH);
        }
    }

    return c;
}

function backdropFront(cfg) {

    if (!cfg.frontArt) {

        const f = cfg.front;

        cfg.frontArt =
            f.kind === "trunks"
                ? makeTrunkLayer(f.seed, f.color)
                : makeTreeLayer(f.seed, 5, 250, 360, f.color);
    }

    return cfg.frontArt;
}

// One picture, looping sideways. Every other copy is flipped, so the edges
// always match and there is no seam.
function drawBackdropLoop(art, offset, g) {

    g = g || ctx;

    const W = GAME_WIDTH;

    const o = ((offset % (2 * W)) + 2 * W) % (2 * W);

    let k = Math.floor(o / W);
    let x = -Math.floor(o - k * W);

    while (x < W) {

        if (k % 2 === 0) {

            g.drawImage(art, x, 0);
        }

        else {

            g.save();

            g.translate(x + W, 0);
            g.scale(-1, 1);

            g.drawImage(art, 0, 0);

            g.restore();
        }

        x += W;
        k++;
    }
}




// The picture to show right now and the ground colours that go with it.
// null when no picture file exists (the code-drawn forest is used then).
// A random picture that really loaded (not the one showing)
function pickBackdrop(not) {

    const ids = BACKDROP_RANDOM.pool.filter((id) =>
        id !== not && backdropArt(BACKDROPS[id])
    );

    if (ids.length === 0) {
        return null;
    }

    return ids[Math.floor(Math.random() * ids.length)];
}

function backdropScene() {

    // Picked here, because the files may still have been loading
    // when the run was reset
    if (!backdropId || !backdropArt(BACKDROPS[backdropId])) {

        backdropId = pickBackdrop(null);
    }

    if (!backdropId) {
        return null;      // no picture files: the code-drawn forest is used
    }

    const cfg = BACKDROPS[backdropId];

    return { cfg: cfg, ground: cfg.ground };
}

function drawBackdropLayer(cfg, alpha) {

    ctx.globalAlpha = alpha;

    drawBackdropLoop(backdropArt(cfg), bg.picX);

    if (cfg.dim > 0) {

        ctx.fillStyle = "rgba(4, 6, 22, " + cfg.dim + ")";
        ctx.fillRect(0, 0, GAME_WIDTH, world.groundY);
    }

    // Dark trees sliding past in front, faster than the picture
    if (cfg.front) {

        drawTiled(backdropFront(cfg), bg.nearX);
    }

    ctx.globalAlpha = 1;
}

function drawFogPatches() {

    ctx.fillStyle = "rgba(160, 175, 210, 0.05)";

    for (let i = 0; i < 4; i++) {

        const fx =
            ((i * 330 - bg.fogX * (0.6 + i * 0.2)) %
            (GAME_WIDTH + 400)) - 200;

        const fxWrapped =
            fx < -200 ? fx + GAME_WIDTH + 400 : fx;

        ctx.beginPath();
        ctx.ellipse(
            fxWrapped, world.groundY - 30 - i * 14,
            220, 26,
            0, 0, Math.PI * 2
        );
        ctx.fill();
    }
}

// The forest drawn in code (used when there are no picture files)
function drawCodeBackground() {

    ctx.drawImage(bg.sky, 0, 0);

    // Twinkling stars
    ctx.fillStyle = "#ffffff";

    for (let i = 0; i < bg.stars.length; i++) {

        const s = bg.stars[i];

        ctx.globalAlpha =
            0.35 + 0.35 * Math.sin(time * 2 + s.phase);

        ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    ctx.globalAlpha = 1;

    // Trees (far to near)
    drawTiled(bg.farTrees, bg.farX);
    drawTiled(bg.midTrees, bg.midX);

    // Fog bank between the tree layers
    const fog = ctx.createLinearGradient(
        0, world.groundY - 140, 0, world.groundY
    );

    fog.addColorStop(0, "rgba(120, 140, 185, 0)");
    fog.addColorStop(1, "rgba(120, 140, 185, 0.16)");

    ctx.fillStyle = fog;
    ctx.fillRect(0, world.groundY - 140, GAME_WIDTH, 140);

    drawTiled(bg.nearTrees, bg.nearX);

    drawFogPatches();

    drawGround(CODE_GROUND);
}

// ---------- the tunnel ----------
function resetTunnel() {

    backdropId = null;
    nextBackdropId = null;
    nextChangeAt = BACKDROP_RANDOM.firstChange;
    dawnShown = 0;
    dawnTarget = 0;

    tunnel = null;
    wipe = null;
}

function spawnTunnel() {

    const step = 4;
    const n = Math.ceil(TUNNEL.length / step) + 1;

    // The underside of the roof: a gentle bumpy line...
    const jag = [];

    let h = 0;

    for (let i = 0; i < n; i++) {

        h += (Math.random() - 0.5) * 9;
        h = Math.max(-12, Math.min(14, h));

        jag.push(h);
    }

    // ...with a few roots hanging down (never low enough to touch a jump)
    for (let k = 0; k < 14; k++) {

        const at = Math.floor(Math.random() * n);
        const len = 24 + Math.random() * 26;
        const wide = 2 + Math.floor(Math.random() * 3);

        for (let j = 0; j < wide && at + j < n; j++) {

            jag[at + j] += len * (1 - j / (wide + 1));
        }
    }

    const flies = [];

    for (let k = 0; k < 16; k++) {

        flies.push({
            u: TUNNEL.mouth + Math.random() * (TUNNEL.length - 2 * TUNNEL.mouth),
            y: 230 + Math.random() * 190,
            ph: Math.random() * 6
        });
    }

    tunnel = { x: GAME_WIDTH + 20, swapped: false, jag: jag, flies: flies };

    sfx.tunnel();
}

function updateTunnel(dt) {

    if (!tunnel) {

        const c = nightCycle(elapsed);

        const hasDawnArt = NIGHT.dawnEnabled && !!backdropArt(BACKDROPS.dawn);

        // The dawn picture comes at the start of every dawn
        if (
            hasDawnArt &&
            dawnShown < c.night &&
            elapsed >= c.dawnStart - TUNNEL.lead
        ) {

            nextBackdropId = "dawn";
            dawnTarget = c.night;

            spawnTunnel();
        }

        // When the dawn is over, back to a night picture
        else if (
            hasDawnArt &&
            backdropId === "dawn" &&
            (!c.dawn || c.r >= NIGHT.dawnLength - TUNNEL.lead)
        ) {

            nextBackdropId = pickBackdrop("dawn");

            if (nextBackdropId) {

                spawnTunnel();
            }

            else {

                backdropId = null;
            }
        }

        // Otherwise a random picture every so often (never around a dawn)
        else if (
            elapsed >= nextChangeAt - TUNNEL.lead &&
            backdropId !== "dawn" &&
            !c.dawn &&
            !(hasDawnArt && c.dawnStart - elapsed < 15)
        ) {

            nextBackdropId = pickBackdrop(backdropId);

            if (nextBackdropId) {

                spawnTunnel();
            }

            else {

                nextChangeAt = elapsed + BACKDROP_RANDOM.every;
            }
        }

        return;
    }

    // It moves with the ground
    tunnel.x -= world.scrollSpeed * dt;

    // Once the dark part covers the whole screen, swap the picture
    if (
        !tunnel.swapped &&
        tunnel.x + TUNNEL.mouth <= 0 &&
        tunnel.x + TUNNEL.length - TUNNEL.mouth >= GAME_WIDTH
    ) {

        tunnel.swapped = true;

        if (nextBackdropId) {
            backdropId = nextBackdropId;
        }

        if (nextBackdropId === "dawn") {
            dawnShown = dawnTarget;
        }

        nextChangeAt = elapsed + BACKDROP_RANDOM.every;
    }

    if (tunnel.x + TUNNEL.length < -20) {

        tunnel = null;
    }
}

// How "inside" the tunnel a spot is: 0 = outside, 1 = fully inside.
// u = distance from the start of the tunnel. The ends slope in and out.
function tunnelDepthAt(u) {

    const edge = Math.min(u, TUNNEL.length - u);

    const t = Math.max(0, Math.min(1, edge / TUNNEL.mouth));

    return t * t * (3 - 2 * t);
}

function drawTunnel() {

    if (!tunnel) {
        return;
    }

    if (!tunnelDeco) {
        tunnelDeco = makeTrunkLayer(31, "#0f1838");
    }

    const W = GAME_WIDTH;
    const step = 4;

    // The dark inside (same gradient for every column)
    const inside = ctx.createLinearGradient(0, 0, 0, world.groundY);

    inside.addColorStop(0, "#04060d");
    inside.addColorStop(1, "#121a36");

    const cave = caveReady();

    const roofShade = ctx.createLinearGradient(0, 0, 0, 150);

    roofShade.addColorStop(0, CAVE.roofColor);
    roofShade.addColorStop(1, "rgba(12, 17, 23, 0)");

    if (cave) {
        drawCaveFrame(-tunnel.x);
    }

    const first = Math.max(0, Math.floor(-tunnel.x / step));

    const last = Math.min(
        tunnel.jag.length - 1,
        Math.ceil((W - tunnel.x) / step)
    );

    ctx.save();

    // Built from thin columns, so the opening can slope in and out
    for (let i = first; i <= last; i++) {

        const xa = Math.round(tunnel.x + i * step);
        const xb = Math.round(tunnel.x + (i + 1) * step);
        const w = xb - xa;

        const r = tunnelDepthAt(i * step + step / 2);

        if (w <= 0 || r <= 0.01) {
            continue;
        }

        if (cave) {

            // The outside dims as the mouth gets close (zero at the very edge, so no seam)...
            ctx.globalAlpha = 0.55 * 4 * r * (1 - r);
            ctx.fillStyle = "#04060d";
            ctx.fillRect(xa, 0, w, GAME_HEIGHT);

            // ...while the cave slowly fades in over it
            ctx.globalAlpha = r;

            ctx.drawImage(
                caveFrame,
                xa, 0, w, GAME_HEIGHT,
                xa, 0, w, GAME_HEIGHT
            );

            // A soft shadow under the rock ceiling (no hard edge)
            ctx.globalAlpha = r * 0.85;
            ctx.fillStyle = roofShade;
            ctx.fillRect(xa, 0, w, 150);

            continue;
        }

        // Inside
        ctx.globalAlpha = r;
        ctx.fillStyle = inside;
        ctx.fillRect(xa, 0, w, world.groundY);

        // Dim trees going past
        const sx = (((xa + bg.nearX * 0.8) % W) + W) % W;
        const sw = Math.min(w, W - sx);

        if (sw > 0) {

            ctx.drawImage(
                tunnelDeco,
                sx, 0, sw, world.groundY,
                xa, 0, sw, world.groundY
            );
        }

        // Floor
        ctx.globalAlpha = r * 0.82;
        ctx.fillStyle = "#05060e";
        ctx.fillRect(xa, world.groundY, w, GAME_HEIGHT - world.groundY);

        // Roof (slopes down from the top at the mouth)
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#030308";
        ctx.fillRect(xa, 0, w, r * (TUNNEL.roof + tunnel.jag[i]));
    }

    // Fireflies (only in the plain dark passage)
    if (!cave) {
    ctx.shadowColor = "#d7ff7a";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#e8ffa0";

    tunnel.flies.forEach((f) => {

        const x = tunnel.x + f.u;

        if (x < -10 || x > W + 10) {
            return;
        }

        ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(time * 2.2 + f.ph * 2));

        ctx.fillRect(
            Math.round(x),
            Math.round(f.y + Math.sin(time * 1.6 + f.ph) * 10),
            3, 3
        );
    });

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    }

    // A soft warm glow around the player while inside, so they stay visible
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;

    const glow = 0.16 * tunnelDepthAt(px - tunnel.x);

    if (glow > 0.01) {

        const g = ctx.createRadialGradient(px, py, 0, px, py, 170);

        g.addColorStop(0, "rgba(255, 190, 110, " + glow + ")");
        g.addColorStop(1, "rgba(255, 190, 110, 0)");

        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = g;
        ctx.fillRect(px - 170, py - 170, 340, 340);
    }

    ctx.restore();
}

function drawBackground() {

    const scene = backdropScene();

    if (!scene) {

        drawCodeBackground();

        return;
    }

    drawScene(scene.cfg, scene.ground);

    if (TRANSITION.mode === "mist" && wipe) {
        drawWipe();
    }

    drawTunnel();
}

function drawScene(cfg, ground) {

    drawBackdropLayer(cfg, 1);

    drawFogPatches();

    drawGround(ground);
}

// Pixel-art cloud bank, drawn once at low resolution then enlarged.
// Big soft puffs that are close in colour, thinning out to nothing at both ends.
function makeMistBank() {

    const px = 5;
    const L = TRANSITION.length;
    const S = TRANSITION.soft;
    const w = Math.ceil(L / px);
    const h = Math.ceil(GAME_HEIGHT / px);

    const small = makeCanvas(w, h);
    const g = small.getContext("2d");

    const rnd = seededRandom(77);
    const col = TRANSITION.colors;

    // Start with a solid base so nothing ever shows through the middle
    g.fillStyle = col[0];
    g.fillRect(0, 0, w, h);

    // Wide, flat cloud shapes (wider than tall) look like drifting mist
    const disc = (x, y, r, c) => {

        g.fillStyle = c;
        g.beginPath();
        g.ellipse(x, y, Math.max(2, r * 2.4), Math.max(1, r * 0.8), 0, 0, Math.PI * 2);
        g.fill();
    };

    const puffs = [];

    for (let i = 0; i < 1500; i++) {

        puffs.push({
            x: rnd() * w,
            y: rnd() * (h + 20) - 10,
            r: (26 + rnd() * 44) / px
        });
    }

    // Higher puffs first, so lower ones overlap them (gives the rolling look)
    puffs.sort((a, b) => a.y - b.y);

    puffs.forEach((p) => {

        disc(p.x, p.y, p.r, col[1]);
        disc(p.x - p.r * 0.1, p.y - p.r * 0.16, p.r * 0.82, col[2]);

        if (p.r > 9) {
            disc(p.x - p.r * 0.22, p.y - p.r * 0.32, p.r * 0.46, col[3]);
        }
    });

    // Thin it out smoothly at both ends (see-through -> solid over "soft")
    const t = S / L;
    const ramp = [0, 0.1, 0.3, 0.55, 0.8, 1];
    const val = [0, 0.04, 0.2, 0.55, 0.9, 1];

    const mask = g.createLinearGradient(0, 0, w, 0);

    ramp.forEach((r, i) => {

        mask.addColorStop(r * t, "rgba(0,0,0," + val[i] + ")");
        mask.addColorStop(1 - r * t, "rgba(0,0,0," + val[i] + ")");
    });

    g.globalCompositeOperation = "destination-in";
    g.fillStyle = mask;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "source-over";

    // Enlarge with hard pixels
    const big = makeCanvas(L, GAME_HEIGHT);
    const bg2 = big.getContext("2d");

    bg2.imageSmoothingEnabled = false;
    bg2.drawImage(small, 0, 0, w * px, h * px);

    return big;
}

function drawWipe() {

    if (!mistBank) {
        mistBank = makeMistBank();
    }

    ctx.drawImage(mistBank, Math.round(wipe.x), 0);
}

function drawGround(look) {

    // Dirt
    ctx.fillStyle = look.dirt;

    ctx.fillRect(
        0,
        world.groundY,
        GAME_WIDTH,
        GAME_HEIGHT - world.groundY
    );

    // Grass strip
    ctx.fillStyle = look.grass;
    ctx.fillRect(0, world.groundY, GAME_WIDTH, 8);

    ctx.fillStyle = look.edge;
    ctx.fillRect(0, world.groundY, GAME_WIDTH, 2);

    // Scrolling texture so the speed is visible
    ctx.fillStyle = look.mark;

    const spacing = 90;
    const shift = bg.groundX % spacing;

    for (let i = -1; i < GAME_WIDTH / spacing + 1; i++) {

        const x = i * spacing - shift;

        ctx.fillRect(x, world.groundY + 22, 40, 4);
        ctx.fillRect(x + 45, world.groundY + 48, 26, 4);
    }
    drawPits(look);
}


// ========================================
// INPUT
// ========================================

const keys = {
    jump: false,
    attack: false,
    left: false,
    right: false,
    down: false
};

function isLeftKey(code) {

    return code === "ArrowLeft" || code === "KeyA";
}

function isRightKey(code) {

    return code === "ArrowRight" || code === "KeyD";
}

function isDownKey(code) {

    return code === "ArrowDown" || code === "KeyS";
}

function clearKeys() {

    keys.jump = false;
    keys.attack = false;
    keys.left = false;
    keys.right = false;
    keys.down = false;
}

function isJumpKey(code) {

    return (
        code === "Space" ||
        code === "ArrowUp" ||
        code === "KeyW"
    );
}

function isAttackKey(code) {

    return (
        code === "KeyQ" ||
        code === "KeyE" ||
        code === "KeyJ" ||
        code === "KeyK"
    );
}

function doJump() {

    // Jumping cancels an attack or the hurt stun, so it never feels locked
    if (player.isAttacking) {

        player.isAttacking = false;
        player.attackFrame = 0;
        player.attackCooldown = 0.1;
    }

    if (player.isHurt) {

        player.isHurt = false;
        player.hurtTimer = 0;
        player.hurtFrame = 0;
    }

    player.velocityY = -player.jumpForce;

    player.isGrounded = false;
    player.wasGrounded = false;

    player.coyote = 0;
    player.jumpBuffer = 0;

    player.jumpTime = 0;

    player.currentAnimation = "jump";

    sfx.jump();
}

function tryJump() {

    if (state !== "playing") {
        return;
    }

    // Stunned by a bird: no jumping until it wears off
    if (player.stunTimer > 0) {
        return;
    }

    if (player.isGrounded || player.coyote > 0) {

        doJump();
    }

    else {

        // In the air: remember the press and jump on landing
        player.jumpBuffer = player.jumpBufferTime;
    }
}

// Releasing jump early = shorter hop
function cutJump() {

    // A released press should not trigger a buffered jump later
    // (a quick tap still buffers, since keyup comes after keydown)

    if (!player.isGrounded && player.velocityY < -540) {

        player.velocityY = -540;
    }
}

// Approximate time in the air for a full jump (used for the jump animation)
function jumpAirTime() {

    const up = player.jumpForce / world.gravity;

    const height =
        (player.jumpForce * player.jumpForce) /
        (2 * world.gravity);

    const down = Math.sqrt(
        (2 * height) /
        (world.gravity * world.fallMultiplier)
    );

    return up + down;
}

function tryAttack() {

    if (
        state === "playing" &&
        !player.isAttacking &&
        player.isGrounded &&
        !player.isHurt &&
        player.attackCooldown <= 0
    ) {

        player.isAttacking = true;

        player.currentAnimation = "attack";

        player.attackFrame = 0;

        player.animationTimer = 0;

        sfx.attack();
    }
}

function togglePause() {

    if (state === "playing") {

        state = "paused";

        // Like Zombie Tsunami: pausing shows your missions
        fillMissionPanel(
            ui.pauseMissions,
            ui.pauseLevel,
            ui.pauseNote
        );

        showOverlay("pause");
    }

    else if (state === "paused") {

        state = "playing";

        showOverlay(null);
    }
}

document.addEventListener("keydown", (event) => {

    const code = event.code;

    if (
        isJumpKey(code) ||
        isAttackKey(code) ||
        isLeftKey(code) ||
        isRightKey(code) ||
        isDownKey(code) ||
        code === "Enter"
    ) {
        event.preventDefault();
    }

    if (event.repeat) {
        return;
    }

    // Browsers only allow audio after a key press / click
    initAudio();
    resumeAudio();

    if (code === "KeyM") {
        toggleMute();
        return;
    }

    // Boot flow: any key continues
    if (state === "loading") {

        advanceFromLoading();

        return;
    }

    if (state === "intro") {

        // Esc skips the whole story, any other key moves it along
        if (code === "Escape") {

            endIntro();
        }

        else {

            advanceIntro();
        }

        return;
    }

    // The shop and missions screens close with Esc;
    // other keys do nothing while one is open
    if (
        state === "menu" &&
        (!ui.shop.classList.contains("hidden") ||
         !ui.missions.classList.contains("hidden"))
    ) {

        if (code === "Escape" || code === "Backspace") {

            if (!ui.shop.classList.contains("hidden")) {
                closeShop();
            }

            else {
                closeMissions();
            }
        }

        return;
    }

    // The How To Play panel closes with any key
    if (state === "menu" && !ui.howto.classList.contains("hidden")) {

        closeHowTo();

        return;
    }

    // Replay the story from the menu
    if (code === "KeyI" && state === "menu") {

        startIntro();

        return;
    }

    if (code === "KeyR") {
        tryBurst();
        return;
    }

    if (code === "KeyP" || code === "Escape") {
        togglePause();
        return;
    }

    // Menu / game over: Space or Enter
    if (code === "Space" || code === "Enter") {

        if (state === "menu") {

            startGame();

            return;
        }

        if (
            state === "gameover" &&
            time - gameOverShownAt > 2.2
        ) {

            startGame();

            return;
        }

        if (state === "paused" && code === "Enter") {

            togglePause();

            return;
        }
    }

    if (isLeftKey(code)) {
        keys.left = true;
    }

    if (isRightKey(code)) {
        keys.right = true;
    }

    if (isDownKey(code)) {
        keys.down = true;
    }

    if (isJumpKey(code)) {

        keys.jump = true;

        tryJump();
    }

    if (isAttackKey(code)) {

        keys.attack = true;

        tryAttack();
    }
});

document.addEventListener("keyup", (event) => {

    if (isLeftKey(event.code)) {
        keys.left = false;
    }

    if (isRightKey(event.code)) {
        keys.right = false;
    }

    if (isDownKey(event.code)) {
        keys.down = false;
    }

    if (isJumpKey(event.code)) {

        keys.jump = false;

        cutJump();
    }

    if (isAttackKey(event.code)) {

        keys.attack = false;
    }
});

// Never leave a key "stuck" if the window loses focus
window.addEventListener("blur", clearKeys);

// Pause when the tab loses focus
document.addEventListener("visibilitychange", () => {

    if (document.hidden && state === "playing") {

        togglePause();
    }
});

// Buttons
function bindClick(id, handler) {

    const el = document.getElementById(id);

    if (el) {

        el.addEventListener("click", () => {

            initAudio();
            resumeAudio();

            handler();

            el.blur();
        });
    }
}

bindClick("btn-play", startGame);
bindClick("btn-restart", startGame);
bindClick("btn-resume", togglePause);
bindClick("btn-pause-menu", showMenu);
bindClick("btn-gameover-menu", showMenu);
bindClick("mute-btn", toggleMute);

// Tap / click anywhere on the boot screens to continue
ui.loading.addEventListener("pointerdown", () => {

    initAudio();
    resumeAudio();

    advanceFromLoading();
});

ui.intro.addEventListener("pointerdown", () => {

    initAudio();
    resumeAudio();

    advanceIntro();
});

// Menu: How To Play panel and story replay
function openHowTo() {

    // Hide the menu behind it so nothing shows through
    ui.menu.classList.add("hidden");

    ui.howto.classList.remove("hidden");
}

function closeHowTo() {

    ui.howto.classList.add("hidden");

    if (state === "menu") {

        ui.menu.classList.remove("hidden");
    }
}

bindClick("btn-howto", openHowTo);
bindClick("btn-howto-back", closeHowTo);
bindClick("btn-story", startIntro);
bindClick("btn-shop", openShop);
bindClick("btn-shop-back", closeShop);
bindClick("btn-missions", openMissions);
bindClick("btn-missions-back", closeMissions);

// Touch controls
function bindTouch(id, onDown, onUp) {

    const el = document.getElementById(id);

    if (!el) {
        return;
    }

    el.addEventListener("pointerdown", (e) => {

        e.preventDefault();

        initAudio();
        resumeAudio();

        onDown();
    });

    el.addEventListener("pointerup", () => {

        if (onUp) {
            onUp();
        }
    });
}

bindTouch("touch-jump", tryJump, cutJump);
bindTouch("touch-attack", tryAttack);

// Tap the game screen to jump
canvas.addEventListener("pointerdown", (e) => {

    initAudio();
    resumeAudio();

    if (state === "playing") {

        e.preventDefault();

        tryJump();
    }
});

canvas.addEventListener("pointerup", cutJump);


// ========================================
// GAME FLOW
// ========================================

function resetGame() {

    // Player
    player.x = 150;
    player.y = world.groundY - player.height;
    player.velocityY = 0;
    player.isGrounded = true;
    player.wasGrounded = true;
    player.isAttacking = false;
    player.isHurt = false;
    player.hurtTimer = 0;
    player.invulnTimer = 0;
    player.stunTimer = 0;
    player.hurtDuration = 0.5;
    player.attackCooldown = 0;
    player.jumpTime = 0;
    player.jumpBuffer = 0;
    player.coyote = 0;
    player.runFrame = 0;
    player.jumpFrame = 0;
    player.attackFrame = 0;
    player.hurtFrame = 0;
    player.deadFrame = 0;
    player.animationTimer = 0;
    player.currentAnimation = "run";

    player.falling = false;
    player.fallPit = null;

    // The Silver Charm blocks the first bite of every run
    player.shield = upgradeLevel("heart") > 0;

    burst.charge = 0;
    burst.fx = 0;

    werewolf.y = world.groundY - werewolf.height;
    werewolf.velocityY = 0;
    werewolf.isGrounded = true;

    werewolf.jumpTimer = 0;
    werewolf.jumpDuration = 0.8;
    werewolf.jumpHeight = 95;
    werewolf.jumpPit = null;
    werewolf.jumpFrame = 0;

    werewolf.x = MOVE.homeX - WOLF.homeGap;
    werewolf.windup = 0;
    werewolf.pendingClose = 0;
    werewolf.hold = 0;
    werewolf.distance = WOLF.homeGap;
    calmWolf();
    werewolf.isAttacking = false;
    werewolf.hitApplied = false;
    werewolf.currentAnimation = "run";
    werewolf.runFrame = 0;
    werewolf.attackFrame = 0;
    werewolf.runAttackFrame = 0;
    werewolf.animationTimer = 0;
    werewolf.attackTimer = 0;

    // Grace period before the first attack
    werewolf.attackCooldown = 3;

    // World
    obstacles = [];
    pits = [];
    pitTimer = PITS.firstAt;

    shards = [];
    particles = [];
    floatTexts = [];


    shardTimer = 2;

    world.scrollSpeed = world.baseSpeed;

    // Night, birds and torch
    birds = [];
    birdTimer = 1;

    drops = [];
    dropTimer = 0;

    caveTraps = [];
    caveTrapTimer = 14;

    fuels = [];
    fuelTimer = 6;

    torch.fuel = maxFuel();
    torch.warned = false;

    bannerTimer = 0;
    darkAnnounced = false;
    nightsSurvived = 0;
    cycleMark.dawn = 0;
    cycleMark.refill = 0;
    cycleMark.dusk = 0;

    // Back to the first picture, no tunnel on the way
    resetTunnel();

    // "Single run" missions start from zero again
    resetRunMissions();

    // Stats
    MAX_LIVES = maxHearts();
    playerLives = MAX_LIVES;
    score = 0;
    distance = 0;
    shardCount = 0;
    bonusPoints = 0;
    elapsed = 0;

    dyingTimer = 0;
    shake = 0;
    flash = 0;

    // Cancel any game-over number count-up
    countToken++;
}

function startGame() {

    initAudio();
    resumeAudio();

    resetGame();

    state = "playing";

    showOverlay(null);

    startAmbient();
}

// ========================================
// LOADING SCREEN + INTRO
// ========================================

// The bar never finishes faster than this, so it doesn't just flash by
const LOAD_MIN_SECONDS = 2.2;

// If an asset hangs, stop waiting after this long
const LOAD_MAX_SECONDS = 8;

const LOADING_TIPS = [
    "Hold jump to leap higher. Tap it for a short hop.",
    "Swing at the wolf just as it lunges to knock it back.",
    "Falling logs can be smashed with your sword.",
    "Moon shards buy upgrades in the shop and charge your Moonlight Burst.",
    "Obstacles only stun you and let the wolf close in. Only its bite costs a heart.",
    "Falling into a pit ends the run. Hold jump to clear it.",
    "Dawn is only a breather: your torch refills, then the next night is harder.",
    "Collect shards to fill the Moonlight Burst meter, then press R to push the wolf away.",
    "Sprint right and the wolf's pounce can fall short. Walk left and it gets closer.",
    "Jump high enough and the wolf's bite misses.",
    "A warning sign at the edge of the screen means a bird is coming.",
    "When the dark falls, grab oil flasks to keep your torch burning.",
    "Spend your moon shards in the shop on torch upgrades and the Silver Charm.",
    "Press P to pause and check your missions. Finish all three to level up."
];

let loadTimer = 0;
let loadProgress = 0;
let loadDone = false;

let tipTimer = 0;
let tipIndex = 0;

// ---- Story cinematic ----
// Each step shows typed text over a different scene.
// A key / tap finishes the typing, then moves on. Esc skips it all.
// With no input it plays on by itself.
const STORY = [
    {
        text: "Hollow Pine was always quiet after dark."
    },
    {
        text: "Then the moon turned red... and the howling began.",
        howl: true
    },
    {
        text: "You ran for the woods. Something was already waiting in the trees."
    },
    {
        text: "SURVIVE UNTIL DAWN.",
        final: true
    }
];

const STORY_CHARS_PER_SEC = 34;
const STORY_AUTO_ADVANCE = 4.2;
const STORY_FINAL_HOLD = 3.2;

let introStep = 0;
let introStepTime = 0;

let storyChars = 0;
let storyTyped = false;
let storyDoneTimer = 0;

function startLoading() {

    resetGame();

    state = "loading";

    loadTimer = 0;
    loadProgress = 0;
    loadDone = false;

    tipTimer = 0;
    tipIndex = Math.floor(Math.random() * LOADING_TIPS.length);

    ui.loadTip.textContent = LOADING_TIPS[tipIndex];
    ui.loadFill.style.width = "0%";
    ui.loadText.textContent = "Loading... 0%";
    ui.loadPrompt.classList.add("hidden");

    showOverlay("loading");
}

function updateLoading(dt) {

    if (loadDone) {
        return;
    }

    loadTimer += dt;

    // Real progress: how many images have finished
    // (a failed image also counts as finished, so a missing file
    //  never traps the player on this screen)
    let finished = 0;

    for (let i = 0; i < imageRegistry.length; i++) {

        if (imageRegistry[i].complete) {
            finished++;
        }
    }

    // Fonts count as loading items too
    finished += FONT_FILES.length - fontsPending;

    const total = imageRegistry.length + FONT_FILES.length;

    let real = total > 0 ? finished / total : 1;

    if (loadTimer >= LOAD_MAX_SECONDS) {
        real = 1;
    }

    const paced = Math.min(1, loadTimer / LOAD_MIN_SECONDS);

    loadProgress = Math.max(loadProgress, Math.min(real, paced));

    const percent = Math.floor(loadProgress * 100);

    ui.loadFill.style.width = percent + "%";
    ui.loadText.textContent = "Loading... " + percent + "%";

    // Rotate tips
    tipTimer += dt;

    if (tipTimer >= 2.5) {

        tipTimer = 0;

        tipIndex = (tipIndex + 1) % LOADING_TIPS.length;

        ui.loadTip.textContent = LOADING_TIPS[tipIndex];
    }

    if (loadProgress >= 1) {

        loadDone = true;

        ui.loadText.textContent = "Ready";

        ui.loadPrompt.classList.remove("hidden");
    }
}

function advanceFromLoading() {

    if (state !== "loading" || !loadDone) {
        return;
    }

    let seen = false;

    try {
        seen = localStorage.getItem("untilDawn.introSeen") === "1";
    } catch (e) { /* ignore */ }

    if (seen) {

        showMenu();
    }

    else {

        startIntro();
    }
}

function enterStoryStep(n) {

    introStep = n;
    introStepTime = 0;

    storyChars = 0;
    storyTyped = false;
    storyDoneTimer = 0;

    const step = STORY[n];

    ui.storyText.textContent = "";
    ui.storyText.classList.toggle("final", !!step.final);

    ui.storyNext.classList.add("hidden");

    for (let i = 0; i < ui.storyDots.length; i++) {

        ui.storyDots[i].classList.toggle("on", i <= n);
    }

    if (step.howl) {

        howl();
    }

    // The last card hits hard
    if (step.final) {

        sfx.growl();

        flash = 0.4;
        shake = 0.3;
    }
}

function startIntro() {

    initAudio();
    resumeAudio();

    state = "intro";

    showOverlay("intro");

    startAmbient();

    enterStoryStep(0);
}

// Key / tap: finish the typing, or go to the next step
function advanceIntro() {

    if (state !== "intro") {
        return;
    }

    const step = STORY[introStep];

    if (!storyTyped) {

        storyChars = step.text.length;

        ui.storyText.textContent = step.text;

        storyTyped = true;
        storyDoneTimer = 0;

        return;
    }

    if (introStep >= STORY.length - 1) {

        endIntro();

        return;
    }

    enterStoryStep(introStep + 1);
}

function updateIntro(dt) {

    introStepTime += dt;

    const step = STORY[introStep];

    if (!storyTyped) {

        const before = Math.floor(storyChars);

        storyChars += dt * STORY_CHARS_PER_SEC;

        const shown = Math.min(
            step.text.length,
            Math.floor(storyChars)
        );

        // Soft typewriter tick
        if (shown !== before && shown % 2 === 0 && !step.final) {

            tone(1400 + Math.random() * 200, 0.02, "square", 0.012);
        }

        ui.storyText.textContent = step.text.slice(0, shown);

        if (shown >= step.text.length) {

            storyTyped = true;
            storyDoneTimer = 0;
        }
    }

    else {

        storyDoneTimer += dt;

        if (storyDoneTimer > 0.5) {

            ui.storyNext.classList.remove("hidden");
        }

        const wait =
            step.final ? STORY_FINAL_HOLD : STORY_AUTO_ADVANCE;

        if (storyDoneTimer >= wait) {

            advanceIntro();
        }
    }
}

function endIntro() {

    if (state !== "intro") {
        return;
    }

    try {
        localStorage.setItem("untilDawn.introSeen", "1");
    } catch (e) { /* ignore */ }

    showMenu();
}

function showMenu() {

    resetGame();

    state = "menu";

    ui.menuBest.textContent = bestScore;
    ui.menuBank.textContent = bank;

    showOverlay("menu");

    // Wind carries on from the intro into the menu
    startAmbient();
}

function showGameOver() {

    state = "gameover";

    gameOverShownAt = time;

    const isNewBest = score > bestScore;

    if (isNewBest) {

        bestScore = score;

        try {
            localStorage.setItem("untilDawn.best", String(bestScore));
        } catch (e) { /* ignore */ }
    }

    // Stop any count-up still running from a previous game
    countToken++;

    ui.gameoverMsg.textContent = gameOverMessage(score);

    // Shard row only matters if shards exist
    ui.rowShards.classList.toggle("hidden", !SHARDS_ENABLED);

    ui.newBest.classList.toggle("hidden", !isNewBest);

    // Numbers count up one after another, timed with the CSS reveal
    countUp(ui.finalScore, score, 1300, 1100);
    countUp(ui.finalDistance, Math.floor(distance), 1500, 800);
    countUp(ui.finalShards, shardCount, 1650, 600);

    if (ui.finalNights) {
        ui.finalNights.textContent = nightsSurvived;
    }

    ui.finalMissions.textContent =
        missionsRun + " done  +" + missionBonus + " shards";
    countUp(ui.finalBest, bestScore, 1800, 600);

    showOverlay("gameover");

    if (isNewBest && score > 0) {

        setTimeout(() => {

            if (state === "gameover") {
                sfx.heal();
            }

        }, 2300);
    }
}

// A short line under the title, based on how well the run went
function gameOverMessage(finalScore) {

    if (finalScore < 100) {
        return "The night has barely begun.";
    }

    if (finalScore < 250) {
        return "The trees closed in behind you.";
    }

    if (finalScore < 500) {
        return "So close... but dawn is still far.";
    }

    return "The forest will remember this run.";
}

// Counts a number up from 0 to target
let countToken = 0;

function countUp(el, target, delay, duration) {

    const token = countToken;

    el.textContent = "0";

    if (target <= 0) {
        return;
    }

    setTimeout(() => {

        const startedAt = performance.now();

        function step(now) {

            // A newer game over (or a restart) cancels this one
            if (token !== countToken) {
                return;
            }

            const p = Math.min(1, (now - startedAt) / duration);

            // Ease out: fast at first, slow near the end
            const eased = 1 - Math.pow(1 - p, 3);

            el.textContent = Math.round(target * eased);

            if (p < 1) {
                requestAnimationFrame(step);
            }
        }

        requestAnimationFrame(step);

    }, delay);
}


// ========================================
// SPAWNING
// ========================================

function addObstacle(type, x) {

    const def = OBSTACLE_TYPES[type];

    obstacles.push({
        type: type,
        x: x,
        y: world.groundY - def.height,
        width: def.width,
        height: def.height
    });

    // Lift any ground shard out of the way
    for (let i = 0; i < shards.length; i++) {

        const l = shards[i];

        if (
            Math.abs(l.x - x) < 90 &&
            l.y > world.groundY - 80
        ) {
            l.y = world.groundY - 125;
        }
    }
}



function spawnShard() {

    const x = GAME_WIDTH + 60;

    // Don't spawn right on top of an obstacle
    for (let i = 0; i < obstacles.length; i++) {

        if (obstacles[i].x > GAME_WIDTH - 150) {

            return false;
        }
    }

    const inAir = Math.random() < 0.4;

    shards.push({
        x: x,
        y: inAir
            ? world.groundY - 125
            : world.groundY - SHARD_SIZE.height,
        width: SHARD_SIZE.width,
        height: SHARD_SIZE.height,
        phase: Math.random() * 6
    });

    return true;
}


// ========================================
// COLLISION
// ========================================

function getPlayerBox() {

    return {
        left: player.x + 10,
        right: player.x + player.width - 10,
        top: player.y + 15,
        bottom: player.y + player.height
    };
}

function boxesOverlap(a, b) {

    return (
        a.right > b.left &&
        a.left < b.right &&
        a.bottom > b.top &&
        a.top < b.bottom
    );
}

function getObstacleBox(o) {

    // Slightly forgiving hitbox
    return {
        left: o.x + 3,
        right: o.x + o.width - 3,
        top: o.y + 3,
        bottom: o.y + o.height
    };
}

function getItemBox(item) {

    return {
        left: item.x,
        right: item.x + item.width,
        top: item.y,
        bottom: item.y + item.height
    };
}

function getAttackBox() {

    return {
        left: player.x + player.width - 10,
        right: player.x + player.width + 70,
        top: player.y,
        bottom: player.y + player.height
    };
}


// ========================================
// DAMAGE / DEATH
// ========================================

function hurtPlayer(stun, bite) {

    player.isHurt = true;
    player.hurtDuration = stun || 0.5;
    player.stunTimer = stun || 0;
    player.hurtTimer = 0;
    player.hurtFrame = 0;
    player.animationTimer = 0;
    player.isAttacking = false;

    // A bite protects you longer than a stumble
    player.invulnTimer = bite ? player.invulnDuration : 0.6;

    player.currentAnimation = "hurt";

    shake = bite ? 0.4 : 0.25;
    flash = bite ? 0.45 : 0.2;

    sfx.hit();

    spawnParticles(
        player.x + 30,
        player.y + 30,
        10,
        bite ? "#b02a2a" : "#8a8478",
        260
    );

    // Only the wolf's bite costs a heart
    if (bite) {

        playerLives--;

        if (playerLives <= 0) {

            die();
        }
    }
}

function die() {

    state = "dying";

    dyingTimer = 0;

    player.isHurt = false;
    player.isAttacking = false;

    // Player dead animation
    player.currentAnimation = "dead";
    player.deadFrame = 0;
    player.animationTimer = 0;

    // Werewolf final attack
    werewolf.isAttacking = false;
    werewolf.currentAnimation = "runAttack";
    werewolf.runAttackFrame = 0;
    werewolf.animationTimer = 0;
    werewolf.distance = Math.min(werewolf.distance, 30);

    stopAmbient();

    sfx.gameOver();
}

function parryWerewolf() {

    // Wolf gets knocked back and has to recover
    werewolf.isAttacking = false;
    werewolf.hitApplied = false;
    werewolf.windup = 0;
    werewolf.pendingClose = 0;
    werewolf.currentAnimation = "run";
    werewolf.attackFrame = 0;

    werewolf.distance = werewolf.maxDistance;
    werewolf.attackCooldown = 2.5;

    bonusPoints += 10;

    missionEvent("escape");

    sfx.parry();

    addFloatText(
        player.x + 40,
        player.y - 20,
        "+10 PARRY",
        "#f1c40f"
    );

    spawnParticles(
        player.x + 70,
        player.y + 30,
        8,
        "#f1c40f",
        220
    );
}


// ========================================
// GAME LOOP
// ========================================

let lastTime = 0;

function gameLoop(currentTime) {

    let deltaTime = (currentTime - lastTime) / 1000;

    // Prevent huge delta time
    if (deltaTime > 0.05) {
        deltaTime = 0.05;
    }

    if (deltaTime < 0) {
        deltaTime = 0;
    }

    lastTime = currentTime;

    update(deltaTime);

    draw();

    requestAnimationFrame(gameLoop);
}


// ========================================
// ANIMATION HELPER
// ========================================

// Advances a frame counter.
// Returns true when a non-looping animation just finished.
function stepAnimation(obj, dt, frameKey, count, loop) {

    obj.animationTimer += dt;

    if (obj.animationTimer >= obj.animationSpeed) {

        obj.animationTimer -= obj.animationSpeed;

        obj[frameKey]++;

        if (obj[frameKey] >= count) {

            if (loop) {

                obj[frameKey] = 0;
            }

            else {

                obj[frameKey] = count - 1;

                return true;
            }
        }
    }

    return false;
}


// ========================================
// UPDATE
// ========================================

function currentWorldSpeed() {

    if (state === "playing") {
        return world.scrollSpeed;
    }

    // Slow scroll behind the boot screens and title screen
    if (state === "loading") {
        return 30;
    }

    if (state === "intro") {
        return 80;
    }

    if (state === "menu") {
        return 120;
    }

    // Frozen while paused / dying / game over
    return 0;
}

function update(dt) {

    time += dt;

    if (state === "paused") {
        return;
    }

    const speed = currentWorldSpeed();

    updateBackground(dt, speed);

    if (state === "loading") {
        updateLoading(dt);
    }

    else if (state === "intro") {
        updateIntro(dt);
    }

    if (state === "playing") {
        updatePlayerMovement(dt);
    }

    updatePlayerPhysics(dt);

    updateWerewolf(dt);

    updatePlayerAnimation(dt);

    if (state === "playing") {

        updateDifficulty(dt);

        updateObstacles(dt);

        updateShards(dt);

        updateAmbientHowl(dt);

        updateTorch(dt);

        updateFuel(dt);

        updateBirds(dt);

        updateDrops(dt);

        updatePits(dt);

        updateCaveTraps(dt);

        updateMissions();

        updateTunnel(dt);
    }

    if (state === "dying") {

        dyingTimer += dt;

        if (dyingTimer >= 1.8) {

            showGameOver();
        }
    }

    tickMissionToasts(dt);

    updateEffects(dt);
}


// ========================================
// PLAYER MOVEMENT (left / right)
// ========================================

// The player can shift a little left or right.
// Going right = sprint: more distance score and the wolf falls back faster,
// but obstacles reach you sooner. Going left = fine-tune your jump spacing.
// With no key held the player drifts back to the home spot.
const MOVE = {
    minX: 70,
    maxX: 340,
    homeX: 150,
    speed: 280,
    drift: 50
};

function isSprinting() {

    return (
        state === "playing" &&
        keys.right &&
        !keys.left &&
        !player.isHurt
    );
}

function updatePlayerMovement(dt) {

    // Stunned: no control, and the player staggers back toward the wolf
    if (player.stunTimer > 0) {

        player.x = Math.max(MOVE.minX, player.x - 50 * dt);

        return;
    }

    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

    if (dir !== 0) {

        player.x += dir * MOVE.speed * dt;
    }

    else if (player.x !== MOVE.homeX) {

        const step = MOVE.drift * dt;

        if (Math.abs(player.x - MOVE.homeX) <= step) {

            player.x = MOVE.homeX;
        }

        else {

            player.x += Math.sign(MOVE.homeX - player.x) * step;
        }
    }

    player.x = Math.max(MOVE.minX, Math.min(MOVE.maxX, player.x));
}


// ========================================
// PLAYER PHYSICS
// ========================================

function updatePlayerPhysics(dt) {

    // Falling into a pit: there is no ground to land on
    if (player.falling) {

        player.velocityY += world.gravity * dt;
        player.y += player.velocityY * dt;

        return;
    }

    if (!player.isGrounded) {

        // Fall faster than you rise
        let g =
            player.velocityY > 0
                ? world.gravity * world.fallMultiplier
                : world.gravity;

        // Holding down / S slams you back to the ground
        // (only once the jump is nearly over, so it never kills a jump)
        if (
            keys.down &&
            state === "playing" &&
            player.velocityY > -150
        ) {
            g *= 2.6;
        }

        player.velocityY += g * dt;

        player.jumpTime += dt;
    }

    player.y += player.velocityY * dt;

    // Ground collision
    const groundLevel = world.groundY - player.height;

    if (player.y >= groundLevel) {

        player.y = groundLevel;

        player.velocityY = 0;

        player.isGrounded = true;
    }

    // Landing sound
    if (
        player.isGrounded &&
        !player.wasGrounded &&
        state === "playing"
    ) {
        sfx.land();
    }

    // Coyote time: still allowed to jump just after leaving the ground
    if (player.isGrounded) {

        player.coyote = player.coyoteTime;
    }

    else if (player.coyote > 0) {

        player.coyote -= dt;
    }

    // Buffered jump: fire as soon as we are back on the ground
    if (player.jumpBuffer > 0) {

        player.jumpBuffer -= dt;

        if (
            player.isGrounded &&
            state === "playing" &&
            player.stunTimer <= 0
        ) {

            doJump();

            // Apply the first bit of the jump this frame
            player.y += player.velocityY * dt;
        }
    }

    player.wasGrounded = player.isGrounded;

    if (player.attackCooldown > 0) {
        player.attackCooldown -= dt;
    }

    if (player.invulnTimer > 0) {
        player.invulnTimer -= dt;
    }

    if (player.stunTimer > 0) {
        player.stunTimer -= dt;
    }
}


// ========================================
// WEREWOLF
// ========================================

function updateWerewolf(dt) {

    if (!werewolf.active) {
        return;
    }

    const w = werewolf;

    const targetX = MOVE.homeX - w.distance;   // pinned: it does not follow your left/right moves

    
    // ------------------------------------
    // AUTO-JUMP OVER GROUND PITS
    // ------------------------------------

    if (
        state === "playing" &&
        w.isGrounded &&
        !w.isAttacking &&
        w.windup <= 0 &&
        w.currentAnimation !== "runAttack"
    ) {
        const approachingPit = pits.find((p) =>
            !p.hit &&
            p !== w.jumpPit &&
            p.x <= w.x + w.width + 35 &&
            p.x + p.width > w.x + 12
        );

        if (approachingPit) {
            w.jumpPit = approachingPit;
            w.isGrounded = false;

            w.jumpTimer = 0;

            // Stay airborne long enough for the pit to pass.
            w.jumpDuration =
                (approachingPit.width + w.width + 55) /
                Math.max(world.scrollSpeed, 1);

            // Wider pits get a slightly higher jump.
            w.jumpHeight = Math.min(
                110,
                75 + (approachingPit.width / 200) * 35
            );

            w.currentAnimation = "jump";
            w.jumpFrame = 0;
            w.animationTimer = 0;
        }
    }

    // ------------------------------------
    // SMOOTH JUMP ARC AND LANDING
    // ------------------------------------

    if (!w.isGrounded) {
        w.jumpTimer += dt;

        const progress = Math.min(
            1,
            w.jumpTimer / w.jumpDuration
        );

        // A smooth arc: rise, reach the peak, then land.
        w.y =
            world.groundY -
            w.height -
            Math.sin(progress * Math.PI) * w.jumpHeight;

        if (progress >= 1) {
            w.y = world.groundY - w.height;
            w.isGrounded = true;
            w.jumpTimer = 0;
            w.jumpPit = null;

            if (
                !w.isAttacking &&
                w.currentAnimation === "jump"
            ) {
                w.currentAnimation = "run";
                w.runFrame = 0;
                w.animationTimer = 0;
            }
        }
    } else {
        w.y = world.groundY - w.height;
    }


    // ------------------------------------
    // POSITION
    // ------------------------------------

    if (w.isAttacking) {

        // Lunge toward the player
        const lungeX = player.x - 15;

        if (w.x < lungeX) {

            w.x = Math.min(lungeX, w.x + 600 * dt);
        }
    }

    else if (w.currentAnimation === "runAttack") {

        // Final run-up when the player dies
        if (w.x < targetX) {

            w.x = Math.min(targetX, w.x + w.speed * dt);
        }
    }

    else {

        if (w.x < targetX) {

            w.x = Math.min(targetX, w.x + w.speed * dt);
        }

        else if (w.x > targetX) {

            // Fall back smoothly after a lunge
            w.x = Math.max(targetX, w.x - 200 * dt);
        }
    }

    // ------------------------------------
    // DISTANCE (only while playing)
    // ------------------------------------

        if (state === "playing") {

        // A stumble closes the gap in steps, not all at once
        if (w.pendingClose > 0) {

            const step = Math.min(w.pendingClose, WOLF.closeRate * dt);

            w.pendingClose -= step;

            w.distance = Math.max(w.minDistance, w.distance - step);
        }

        if (w.hold > 0) {
            w.hold -= dt;
        }

        const busy = w.isAttacking || w.windup > 0;

        // No pouncing while you are stunned or still recovering
        const recovering =
            player.isHurt ||
            player.stunTimer > 0 ||
            player.invulnTimer > 0;

        // The danger window after a stumble: the wolf stays close.
        // If it runs out with no second stumble, the threat is gone.
        if (w.threatTimer > 0) {

            w.threatTimer -= dt;

            if (w.threatTimer <= 0) {

                w.threatTimer = 0;
                w.threat = 0;
            }
        }

        // No danger: the wolf falls back into place (faster if you sprint)
        if (
            !busy &&
            w.hold <= 0 &&
            w.threatTimer <= 0 &&
            w.pendingClose <= 0
        ) {

            const rate = WOLF.recover * (isSprinting() ? 2 : 1) * dt;

            if (Math.abs(w.distance - WOLF.homeGap) <= rate) {

                w.distance = WOLF.homeGap;
            }

            else {

                w.distance += Math.sign(WOLF.homeGap - w.distance) * rate;
            }
        }

        // Crouch and growl first, so the pounce can be seen coming
        if (w.windup > 0) {

            // The crouch waits while you are stunned or recovering
            if (!recovering) {
                w.windup -= dt;
            }

            // A well-timed swing staggers it
            if (player.isAttacking) {

                w.windup = 0;

                parryWerewolf();
            }

            else if (w.windup <= 0) {

                w.isAttacking = true;
                w.hitApplied = false;

                w.currentAnimation = "attack";

                w.attackFrame = 0;
                w.animationTimer = 0;
                w.attackTimer = 0;

                sfx.growl();
            }
        }

        // Second stumble in a short time: the wolf goes for you
        else if (w.strike && !w.isAttacking && w.hold <= 0) {

            w.strike = false;

            w.windup = WOLF.windup;

            sfx.growl();
        }
    }

    // ------------------------------------
    // ANIMATION
    // ------------------------------------

    if (w.currentAnimation === "jump" && !w.isGrounded) {
        stepAnimation(
            w,
            dt,
            "jumpFrame",
            w.jumpFrameCount,
            true
        );
    }

    else if (w.currentAnimation === "runAttack") {

        // Stay on final frame
        stepAnimation(
            w,
            dt,
            "runAttackFrame",
            w.runAttackFrameCount,
            false
        );
    }

    else if (w.isAttacking) {

        w.attackTimer += dt;

        // Damage lands on the third frame
        if (w.attackFrame >= 2 && !w.hitApplied) {

            w.hitApplied = true;

            resolveWerewolfHit();
        }

        // The hit may have parried the wolf
        if (w.isAttacking) {

            const finished = stepAnimation(
                w,
                dt,
                "attackFrame",
                w.attackFrameCount,
                false
            );

            if (finished) {

                w.attackFrame = 0;

                w.isAttacking = false;

                w.currentAnimation = "run";

                w.attackCooldown = w.attackCooldownDuration;

                // Don't chain attacks back to back
                w.distance = Math.max(w.distance, 105);
            }
        }
    }

    else {

        stepAnimation(
            w,
            dt,
            "runFrame",
            w.runFrameCount,
            true
        );
    }
}

function resolveWerewolfHit() {

    // Jumping high enough dodges it
    const airborne =
        player.y <
        world.groundY - player.height - 45;

    if (airborne) {

        addFloatText(
            player.x + 20,
            player.y - 20,
            "DODGE",
            "#8fd3ff"
        );

        missionEvent("escape");

        return;
    }

    // Attacking at the right moment parries it
    if (player.isAttacking) {

        parryWerewolf();

        return;
    }

    // Sprinting far enough away means the pounce falls short
    if (player.x - werewolf.x > WOLF.reach) {

        addFloatText(
            player.x + 20,
            player.y - 20,
            "OUTRAN IT",
            "#8fd3ff"
        );

        missionEvent("escape");

        return;
    }

    if (player.invulnTimer <= 0 && state === "playing") {

        // The Silver Charm takes the bite
        if (player.shield) {

            shieldBlock();

            return;
        }

        hurtPlayer(0, true);

        // After a bite the wolf is knocked back to give you room
        if (state === "playing") {

            werewolf.distance = Math.max(werewolf.distance, 120);
            werewolf.pendingClose = 0;
        }
    }
}


// ========================================
// PLAYER ANIMATION
// ========================================

function updatePlayerAnimation(dt) {

    // Dead
    if (player.currentAnimation === "dead") {

        stepAnimation(
            player,
            dt,
            "deadFrame",
            player.deadFrameCount,
            false
        );

        return;
    }

    // Menu / boot screens: just run
    if (
        state === "menu" ||
        state === "intro" ||
        state === "loading"
    ) {

        player.currentAnimation = "run";

        stepAnimation(
            player,
            dt,
            "runFrame",
            player.runFrameCount,
            true
        );

        return;
    }

    // Attack
    if (player.isAttacking) {

        const finished = stepAnimation(
            player,
            dt,
            "attackFrame",
            player.attackFrameCount,
            false
        );

        // Crate smashing happens during the swing
        if (player.attackFrame >= 1) {

            swatBirds();
            smashLogs();
            smashDrops();
        }

        if (finished) {

            player.isAttacking = false;

            player.attackFrame = 0;

            player.currentAnimation = "run";

            player.attackCooldown =
                player.attackCooldownDuration;
        }

        return;
    }

    // Hurt
    if (player.isHurt) {

        player.hurtTimer += dt;

        stepAnimation(
            player,
            dt,
            "hurtFrame",
            player.hurtFrameCount,
            false
        );

        if (player.hurtTimer >= player.hurtDuration) {

            player.isHurt = false;

            player.hurtTimer = 0;

            player.hurtFrame = 0;

            player.currentAnimation = "run";
        }

        return;
    }

    // Normal
    if (!player.isGrounded) {

        player.currentAnimation = "jump";

        // Spread the jump frames over the jump's airtime
        const airTime = jumpAirTime();

        const progress =
            Math.min(0.999, player.jumpTime / airTime);

        player.jumpFrame =
            Math.floor(progress * player.jumpFrameCount);
    }

    else {

        player.currentAnimation = "run";

        stepAnimation(
            player,
            dt,
            "runFrame",
            player.runFrameCount,
            true
        );
    }
}



// ========================================
// DIFFICULTY
// ========================================

function updateDifficulty(dt) {

    elapsed += dt;

    // Speed ramps up slowly until the cap
    world.scrollSpeed = Math.min(
        world.maxSpeed,
        world.baseSpeed + elapsed * 5
    );

    distance +=
        ((world.scrollSpeed * dt) / 50) * (isSprinting() ? 1.3 : 1);

    score =
        Math.floor(distance) +
        shardCount * 10 +
        bonusPoints;
}


// ========================================
// OBSTACLES
// ========================================

function updateObstacles(dt) {



    // Move + collide
    const playerBox = getPlayerBox();

    for (let i = obstacles.length - 1; i >= 0; i--) {

        const o = obstacles[i];

        o.x -= world.scrollSpeed * dt;

        // Off screen
        if (o.x + o.width < 0) {

            obstacles.splice(i, 1);

            continue;
        }

        if (
            player.invulnTimer <= 0 &&
            !player.isHurt &&
            boxesOverlap(playerBox, getObstacleBox(o))
        ) {

            // Player stumbles
            hurtPlayer(0.35);

            // Werewolf gets closer (a little at a time)
            pushWolf(WOLF.stumble);

            // Remove obstacle
            obstacles.splice(i, 1);

            spawnParticles(
                o.x + o.width / 2,
                o.y + o.height / 2,
                8,
                OBSTACLE_TYPES[o.type].color,
                240
            );

            // Player died: stop checking
            if (state !== "playing") {
                break;
            }
        }
    }
}


// ========================================
// MOON SHARDS
// ========================================

function updateShards(dt) {

    if (!SHARDS_ENABLED) {
        return;
    }

    shardTimer -= dt;

    if (shardTimer <= 0) {

        if (spawnShard()) {

            shardTimer = 2.5 + Math.random() * 3;
        }

        else {

            // Try again shortly
            shardTimer = 0.4;
        }
    }

    const playerBox = getPlayerBox();

    for (let i = shards.length - 1; i >= 0; i--) {

        const l = shards[i];

        l.x -= world.scrollSpeed * dt;

        if (l.x + l.width < 0) {

            shards.splice(i, 1);

            continue;
        }

        if (boxesOverlap(playerBox, getItemBox(l))) {

            shards.splice(i, 1);

            shardCount++;

            // Every shard charges the Moonlight Burst
            if (burst.charge < BURST.cost) {

                burst.charge++;

                if (burst.charge === BURST.cost) {

                    addFloatText(
                        player.x - 10,
                        player.y - 60,
                        "BURST READY  [R]",
                        "#9fd0ff"
                    );
                }
            }

            // Straight into the bank (saved), so it counts even if you die
            addShards(1);

            missionEvent("shards");

            sfx.collect();

            addFloatText(l.x, l.y - 10, "+10", "#9fd0ff");

        }
    }
}


// ========================================
// ATMOSPHERE
// ========================================

function updateAmbientHowl(dt) {

    audio.howlTimer -= dt;

    if (audio.howlTimer <= 0) {

        howl();

        audio.howlTimer = 14 + Math.random() * 14;
    }
}

function updateEffects(dt) {

    if (shake > 0) {
        shake = Math.max(0, shake - dt);
    }

    if (flash > 0) {
        flash = Math.max(0, flash - dt);
    }

    if (burst.fx > 0) {
        burst.fx = Math.max(0, burst.fx - dt);
    }

    for (let i = particles.length - 1; i >= 0; i--) {

        const p = particles[i];

        p.life -= dt;

        if (p.life <= 0) {

            particles.splice(i, 1);

            continue;
        }

        p.vy += 900 * dt;

        p.x += p.vx * dt;
        p.y += p.vy * dt;
    }

    for (let i = floatTexts.length - 1; i >= 0; i--) {

        const t = floatTexts[i];

        t.life -= dt;

        t.y -= 40 * dt;

        if (t.life <= 0) {

            floatTexts.splice(i, 1);
        }
    }
}


// ========================================
// DRAW
// ========================================

function drawText(text, x, y, size, align, color) {

    ctx.font = size + "px " + FONT_UI;

    ctx.textAlign = align || "left";

    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
    ctx.strokeText(text, x, y);

    ctx.fillStyle = color || "#ffffff";
    ctx.fillText(text, x, y);
}

function drawHeartShape(x, y, s, color) {

    ctx.fillStyle = color;

    ctx.beginPath();

    ctx.moveTo(x + s / 2, y + s * 0.9);

    ctx.bezierCurveTo(
        x - s * 0.2, y + s * 0.45,
        x + s * 0.1, y - s * 0.1,
        x + s / 2, y + s * 0.25
    );

    ctx.bezierCurveTo(
        x + s * 0.9, y - s * 0.1,
        x + s * 1.2, y + s * 0.45,
        x + s / 2, y + s * 0.9
    );

    ctx.fill();
}

function drawHUD() {

    // Score
    drawText("SCORE " + score, 20, 40, 22, "left", "#ffffff");

    // Hearts / lives (lost hearts shown dim)
    for (let i = 0; i < MAX_LIVES; i++) {

        const hx = 20 + i * 45;

        ctx.globalAlpha = i < playerLives ? 1 : 0.2;

        if (ready(heartSprite)) {

            ctx.drawImage(heartSprite, hx, 52, 35, 35);
        }

        else {

            drawHeartShape(hx, 52, 32, "#d13a3a");
        }
    }

    ctx.globalAlpha = 1;

    if (player.shield) {
        drawText("CHARM", 20 + MAX_LIVES * 45 + 4, 78, 12, "left", "#cfe6ff");
    }

    // Shard count + distance
    if (SHARDS_ENABLED) {

        drawShard(22, 94, 22, 28, 0, false);

        drawText("x " + shardCount, 54, 116, 16, "left", "#cfe6ff");
    }

    drawText(
        Math.floor(distance) + " m",
        20,
        SHARDS_ENABLED ? 146 : 116,
        14,
        "left",
        "#9aa0b8"
    );

    // Which night it is (top centre)
    if (elapsed >= NIGHT.darkStart - 1 && NIGHT.dawnEnabled) {

        const c = nightCycle(elapsed);

        drawText(
            c.dawn ? "DAWN" : "NIGHT " + c.night,
            GAME_WIDTH / 2,
            34,
            16,
            "center",
            c.dawn ? "#ffd27a" : "#9fd0ff"
        );
    }

    // Torch fuel bar (appears when the dark starts to fall)
    if (darknessLevel() > 0.02) {

        const bx = 20;
        const by = SHARDS_ENABLED ? 156 : 126;

        const low = torch.fuel <= NIGHT.flickerTime;

        drawText("TORCH", bx, by + 11, 12, "left", "#ffb347");

        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(bx + 62, by, 120, 12);

        ctx.fillStyle =
            low && Math.floor(time * 6) % 2 === 0
                ? "#e05555"
                : "#ffb347";

        ctx.fillRect(
            bx + 62,
            by,
            120 * (torch.fuel / maxFuel()),
            12
        );

        ctx.strokeStyle = "#12060a";
        ctx.lineWidth = 2;
        ctx.strokeRect(bx + 62, by, 120, 12);

        drawText(
            Math.ceil(torch.fuel) + "s",
            bx + 190,
            by + 11,
            12,
            "left",
            low ? "#e05555" : "#ffb347"
        );
    }

    // Big message when the dark begins
    if (bannerTimer > 0) {

        ctx.globalAlpha = Math.min(1, bannerTimer);

        drawText(bannerText, GAME_WIDTH / 2, 190, 30, "center", "#ffb347");
        drawText(bannerSub, GAME_WIDTH / 2, 222, 15, "center", "#cfd3e6");

        ctx.globalAlpha = 1;
    }

    // "Mission complete" pop-up (the full list is on the pause screen)
    drawMissionToast();

    // Best score (top right, under the sound button)
    drawText(
        "BEST " + Math.max(bestScore, score),
        GAME_WIDTH - 20,
        78,
        14,
        "right",
        "#c9b458"
    );

    // Moonlight Burst meter (shards charge it, press R)
    if (SHARDS_ENABLED) {

        const burstReady = burst.charge >= BURST.cost;

        const bx = GAME_WIDTH - 150;
        const by = 134;

        drawText(
            burstReady ? "BURST: PRESS R" : "MOONLIGHT BURST",
            GAME_WIDTH - 20,
            by - 6,
            12,
            "right",
            burstReady ? "#9fd0ff" : "#7d86a8"
        );

        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(bx, by, 130, 10);

        ctx.fillStyle =
            burstReady && Math.floor(time * 6) % 2 === 0
                ? "#ffffff"
                : "#79b2ee";

        ctx.fillRect(bx, by, 130 * (burst.charge / BURST.cost), 10);

        ctx.strokeStyle = "#12060a";
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, 130, 10);
    }

    // Sprint tag while holding right
    if (isSprinting()) {

        drawText(
            "SPRINT +30%",
            GAME_WIDTH - 20,
            104,
            14,
            "right",
            "#ff9f43"
        );
    }
}

function drawObstacle(o) {

    // Only fallen logs are left (drawn in code)
    ctx.save();
    ctx.translate(o.x + o.width / 2, o.y + o.height / 2);

    drawLogShape(o.width, o.height);

    ctx.restore();
}

function drawWerewolf() {

    const w = werewolf;

    const jitter = w.windup > 0 ? (Math.random() - 0.5) * 4 : 0;

    let sprite;
    let frame;

    if (w.currentAnimation === "attack") {

        sprite = w.attackSprite;
        frame = w.attackFrame;
    }

    else if (w.currentAnimation === "jump") {
        sprite = w.jumpSprite;
        frame = w.jumpFrame;
    }

    else if (w.currentAnimation === "runAttack") {

        sprite = w.runAttackSprite;
        frame = w.runAttackFrame;
    }

    // Run sprite
    else {

        sprite = w.runSprite;
        frame = w.runFrame;
    }

    if (ready(sprite)) {

        ctx.drawImage(

            sprite,

            // Source position
            frame * w.frameWidth,
            0,

            // Source size
            w.frameWidth,
            w.frameHeight,

            // Destination position
            w.x + jitter,
            w.y - 48,

            // Destination size
            128,
            128
        );
    }

    else {

        // Placeholder if the sprite did not load
        ctx.fillStyle = "#2a2a35";
        ctx.fillRect(w.x, w.y, w.width, w.height);

        ctx.fillStyle = "#ff3b3b";
        ctx.fillRect(w.x + w.width - 18, w.y + 14, 6, 6);
    }
}

function drawPlayer() {

    const inPit = player.falling && player.fallPit;

    if (inPit) {

        ctx.save();

        ctx.beginPath();
        ctx.rect(0, 0, GAME_WIDTH, world.groundY);
        ctx.rect(
            player.fallPit.x,
            world.groundY,
            player.fallPit.width,
            GAME_HEIGHT - world.groundY
        );
        ctx.clip();
    }

    let sprite;
    let frame;

    switch (player.currentAnimation) {

        case "jump":
            sprite = player.jumpSprite;
            frame = player.jumpFrame;
            break;

        case "attack":
            sprite = player.attackSprite;
            frame = player.attackFrame;
            break;

        case "hurt":
            sprite = player.hurtSprite;
            frame = player.hurtFrame;
            break;

        case "dead":
            sprite = player.deadSprite;
            frame = player.deadFrame;
            break;

        default:
            sprite = player.runSprite;
            frame = player.runFrame;
    }

    // Blink while invincible
    const blink =
        player.invulnTimer > 0 &&
        state === "playing" &&
        Math.floor(player.invulnTimer * 14) % 2 === 0;

    if (blink) {
        ctx.globalAlpha = 0.35;
    }

    if (ready(sprite)) {

        ctx.drawImage(

            sprite,

            // Source position
            frame * player.frameWidth,
            0,

            // Source size
            player.frameWidth,
            player.frameHeight,

            // Destination position
            player.x,
            player.y - 58,

            // Destination size
            128,
            128
        );
    }

    else {

        // Placeholder if the sprite did not load
        ctx.fillStyle = "#d8d8e8";
        ctx.fillRect(
            player.x,
            player.y,
            player.width,
            player.height
        );
    }

    // Silver Charm: a glowing ring while the shield is up
    if (player.shield && state === "playing") {

        const pulse = 0.5 + 0.5 * Math.sin(time * 4);

        ctx.save();

        ctx.globalAlpha = 0.35 + 0.25 * pulse;
        ctx.strokeStyle = "#cfe6ff";
        ctx.shadowColor = "#9fd0ff";
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.arc(player.x + 40, player.y + 28, 48, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    ctx.globalAlpha = 1;

    if (inPit) {
        ctx.restore();
    }
}

// ========================================
// STORY SCENES (drawn behind the story text)
// ========================================

// Pairs of eyes hiding in the trees (step 3 of the story)
const STORY_EYES = [
    { x: 150, y: 335, s: 1.0 },
    { x: 365, y: 300, s: 0.8 },
    { x: 545, y: 350, s: 1.1 },
    { x: 695, y: 312, s: 0.9 },
    { x: 855, y: 345, s: 1.0 }
];

function drawStoryScene() {

    // Step 2: the moon turns red
    if (introStep >= 1) {

        const k =
            introStep === 1
                ? Math.min(1, introStepTime / 1.6)
                : 1;

        const glow = ctx.createRadialGradient(
            770, 105, 10,
            770, 105, 240
        );

        glow.addColorStop(0, "rgba(255, 50, 40, " + (0.5 * k) + ")");
        glow.addColorStop(1, "rgba(255, 50, 40, 0)");

        ctx.fillStyle = glow;
        ctx.fillRect(500, 0, 460, 360);

        ctx.fillStyle = "rgba(185, 25, 25, " + (0.9 * k) + ")";

        ctx.beginPath();
        ctx.arc(770, 105, 40, 0, Math.PI * 2);
        ctx.fill();

        // Whole scene turns a little red
        ctx.fillStyle = "rgba(60, 0, 0, " + (0.22 * k) + ")";
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // Step 3: glowing eyes open in the dark
    if (introStep >= 2) {

        for (let i = 0; i < STORY_EYES.length; i++) {

            const e = STORY_EYES[i];

            // Eyes open one after another
            const appear =
                introStep === 2
                    ? Math.max(0, Math.min(1, (introStepTime - i * 0.45) / 0.4))
                    : 1;

            // Slow blink
            const blink =
                Math.sin(time * 1.7 + i * 2.3) > 0.93 ? 0.1 : 1;

            const a = appear * blink;

            if (a <= 0.02) {
                continue;
            }

            // Shadow behind the eyes so they sit in darkness
            const shade = ctx.createRadialGradient(
                e.x, e.y, 4,
                e.x, e.y, 44 * e.s
            );

            shade.addColorStop(0, "rgba(2, 3, 8, " + (0.9 * appear) + ")");
            shade.addColorStop(1, "rgba(2, 3, 8, 0)");

            ctx.fillStyle = shade;
            ctx.fillRect(e.x - 50, e.y - 50, 100, 100);

            ctx.save();

            ctx.globalAlpha = a;
            ctx.shadowColor = "#ff2a2a";
            ctx.shadowBlur = 14;
            ctx.fillStyle = "#ff3b30";

            ctx.beginPath();
            ctx.ellipse(
                e.x - 9 * e.s, e.y,
                5 * e.s, 2.6 * e.s,
                -0.25, 0, Math.PI * 2
            );
            ctx.fill();

            ctx.beginPath();
            ctx.ellipse(
                e.x + 9 * e.s, e.y,
                5 * e.s, 2.6 * e.s,
                0.25, 0, Math.PI * 2
            );
            ctx.fill();

            ctx.restore();
        }
    }
}

// Player and wolf are only shown when the scene needs them
function showActors() {

    if (state === "loading") {
        return false;
    }

    // The story shows them only for the final chase
    if (state === "intro" && introStep < 3) {
        return false;
    }

    return true;
}

// A ring of moonlight sweeps out from the player
function drawBurstFx() {

    if (burst.fx <= 0) {
        return;
    }

    const k = burst.fx / BURST.fxTime;

    const cx = player.x + 40;
    const cy = player.y + 28;

    ctx.save();

    ctx.fillStyle = "rgba(150, 200, 255, " + (0.28 * k) + ")";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(190, 225, 255, " + k + ")";
    ctx.shadowColor = "#9fd0ff";
    ctx.shadowBlur = 20;
    ctx.lineWidth = 6 + 10 * k;

    ctx.beginPath();
    ctx.arc(cx, cy, (1 - k) * 620 + 30, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

function draw() {

    ctx.save();

    // Screen shake
    if (shake > 0) {

        ctx.translate(
            (Math.random() - 0.5) * shake * 24,
            (Math.random() - 0.5) * shake * 24
        );
    }

    // Clear canvas
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    drawBackground();

    if (state === "intro") {
        drawStoryScene();
    }

    // Obstacles
    obstacles.forEach(drawObstacle);

    // Falling logs
    drawDrops();

    // Cave traps
    caveTraps.forEach(drawCaveTrap);

    // Werewolf (kept hidden on the loading screen so it stays moody)
    if (werewolf.active && showActors()) {
        drawWerewolf();
    }

    // Moon shards
    if (SHARDS_ENABLED) {

        shards.forEach((l) => {

            drawShard(l.x, l.y, l.width, l.height, l.phase, false);
        });
    }

    // Player
    if (showActors()) {
        drawPlayer();
    }

    // Birds (a bird still warning from the edge is not drawn yet)
    birds.forEach((b) => {

        if (b.phase !== "warn") {
            drawBird(b, false);
        }
    });

    // Particles
    particles.forEach((p) => {

        ctx.globalAlpha = Math.max(0, p.life / p.max);

        ctx.fillStyle = p.color;

        ctx.fillRect(p.x, p.y, p.size, p.size);
    });

    ctx.globalAlpha = 1;

    // Floating texts
    floatTexts.forEach((t) => {

        ctx.globalAlpha = Math.max(0, Math.min(1, t.life * 1.5));

        drawText(t.text, t.x, t.y, 15, "left", t.color);
    });

    ctx.globalAlpha = 1;

    ctx.restore();

    // Dark edges
    // Night: darkness, then the things that glow through it
    drawDarkness();

    drawNightExtras();

    drawBurstFx();

    ctx.drawImage(bg.vignette, 0, 0);

    // Red flash when hurt
    if (flash > 0) {

        ctx.fillStyle =
            "rgba(200, 20, 20, " + (flash * 0.7) + ")";

        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // Each story step fades in from black
    if (state === "intro") {

        const fade = Math.max(0, 1 - introStepTime / 0.9);

        if (fade > 0) {

            ctx.fillStyle = "rgba(0, 0, 0, " + fade + ")";

            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        }
    }

    // Screen slowly darkens while the wolf finishes the player
    if (state === "dying" || state === "gameover") {

        const fade =
            state === "gameover"
                ? 0.55
                : Math.min(0.55, (dyingTimer / 1.8) * 0.55);

        ctx.fillStyle = "rgba(14, 0, 0, " + fade + ")";

        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // HUD (hidden on the title screen and behind the game-over card)
    if (
        state !== "loading" &&
        state !== "intro" &&
        state !== "menu" &&
        state !== "gameover"
    ) {
        drawHUD();
    }
}


// ========================================
// START
// ========================================

updateMuteButton();

startLoading();

requestAnimationFrame(gameLoop);