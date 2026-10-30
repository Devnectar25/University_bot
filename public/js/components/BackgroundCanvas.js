// BackgroundCanvas.js - Ambient animated background with glowing orbs and subtle grid
window.GUNi = window.GUNi || {};

window.GUNi.BackgroundCanvas = function BackgroundCanvas() {
    return (
        <div className="bg-canvas" aria-hidden="true">
            <div className="bg-grid"></div>
            <div className="orb orb-1"></div>
            <div className="orb orb-2"></div>
            <div className="orb orb-3"></div>
        </div>
    );
};

