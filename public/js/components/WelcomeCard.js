// WelcomeCard.js - Initial friendly greeting screen with clean, localized suggestion cards
window.GUNi = window.GUNi || {};

window.GUNi.WelcomeCard = function WelcomeCard({ t, onSelectChip }) {
    const defaultCards = [
        {
            icon: 'bi bi-mortarboard-fill',
            title: 'Streams & Faculties',
            desc: 'Explore Engineering, Management, Pharmacy & 8+ streams',
            query: 'How many streams are available at Ganpat University?'
        },
        {
            icon: 'bi bi-pencil-square',
            title: 'Admissions 2026',
            desc: 'Eligibility criteria, application portal & process',
            query: 'What is the admission procedure for Ganpat University?'
        },
        {
            icon: 'bi bi-cash-stack',
            title: 'Fees & Scholarships',
            desc: 'Annual tuition fee matrix and MYSY scholarship details',
            query: 'What are the course fees and available scholarships?'
        },
        {
            icon: 'bi bi-building-check',
            title: 'Hostels & Mess',
            desc: 'Room types, mess fees, safety & campus facilities',
            query: 'What are the hostel facilities and fees at Ganpat University?'
        },
        {
            icon: 'bi bi-briefcase-fill',
            title: 'Placements & CDC',
            desc: 'Salary packages, recruiting companies & stats',
            query: 'Tell me about Ganpat University placements and top recruiters'
        },
        {
            icon: 'bi bi-bus-front-fill',
            title: 'Bus & Transport',
            desc: 'Transit pickup routes from Ahmedabad & Mehsana',
            query: 'What are the transportation bus routes for Ganpat University?'
        }
    ];

    const cards = (t && Array.isArray(t.promptCards) && t.promptCards.length > 0)
        ? t.promptCards
        : defaultCards;

    return (
        <div className="welcome-card" id="welcome-card">
            <div className="welcome-badge">
                <img src="/images/guni-crest.png" alt="Ganpat University" className="welcome-badge-img" />
                <span className="welcome-badge-label">{t?.officialBadge || 'Official AI Assistant'}</span>
            </div>
            <h1 className="welcome-title">{t?.welcomeHeading || 'Hello, how can I help?'}</h1>
            <p className="welcome-sub">
                {t?.welcomeSub ||
                    "Ask me anything about Ganpat University admissions, course eligibility, fees, campus hostels, transportation, or placements."}
            </p>

            <div className="welcome-grid">
                {cards.map((card, idx) => (
                    <button
                        key={idx}
                        type="button"
                        className="welcome-prompt-card"
                        onClick={() => onSelectChip(card.query)}
                    >
                        <div className="prompt-card-icon">
                            <i className={card.icon}></i>
                        </div>
                        <div className="prompt-card-text">
                            <span className="prompt-card-title">{card.title}</span>
                            <span className="prompt-card-desc">{card.desc}</span>
                        </div>
                        <i className="bi bi-arrow-up-right prompt-card-arrow"></i>
                    </button>
                ))}
            </div>
        </div>
    );
};
