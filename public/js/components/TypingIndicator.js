// TypingIndicator.js - Animated 3-dot indicator when assistant is generating reply
window.GUNi = window.GUNi || {};

window.GUNi.TypingIndicator = function TypingIndicator() {
    return (
        <div className="typing-row px-4 mb-2" id="typing-indicator">
            <div className="typing-bubble">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
            </div>
        </div>
    );
};
