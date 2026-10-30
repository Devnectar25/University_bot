// WelcomeCard.js - Initial friendly greeting screen with localized suggestion chips
window.GUNi = window.GUNi || {};

window.GUNi.WelcomeCard = function WelcomeCard({ t, onSelectChip }) {
    const chips = t?.chips || [
        'Admission process',
        'Hostel & Mess facilities',
        'Campus bus routes',
        'PhD Admission & fees',
        'Top placement recruiters'
    ];

    return (
        <div className="welcome-card" id="welcome-card">
            <div className="welcome-icon">🎓</div>
            <h2 id="welcome-title">{t?.welcomeHeading || 'Hello, how can I help?'}</h2>
            <p id="welcome-sub">
                {t?.welcomeSub ||
                    "I'm your AI assistant for Ganpat University. Ask me about admissions, campus facilities, hostels, bus routes, placements, and courses."}
            </p>
            <div className="suggestion-chips" id="suggestion-chips">
                {chips.map((chipText, idx) => (
                    <button
                        key={idx}
                        type="button"
                        className="chip"
                        onClick={() => onSelectChip(chipText)}
                    >
                        {chipText}
                    </button>
                ))}
            </div>
        </div>
    );
};

