// LanguageToggle.js - Segmented pill switch for English, Hindi, and Gujarati
window.GUNi = window.GUNi || {};

window.GUNi.LanguageToggle = function LanguageToggle({ currentLanguage, onLanguageChange }) {
    const languages = [
        { code: 'en', full: 'English', short: 'EN', title: 'Switch to English' },
        { code: 'hi', full: 'हिन्दी', short: 'HI', title: 'हिन्दी में बदलें' },
        { code: 'gu', full: 'ગુજરાતી', short: 'GU', title: 'ગુજરાતીમાં બદલો' }
    ];

    return (
        <div className="modern-lang-toggle" role="tablist" aria-label="Language Selector">
            <span className="lang-icon" aria-hidden="true">
                <i className="bi bi-translate"></i>
            </span>
            {languages.map((lang) => {
                const isActive = currentLanguage === lang.code;
                return (
                    <button
                        key={lang.code}
                        type="button"
                        className={`lang-pill${isActive ? ' active' : ''}`}
                        data-lang={lang.code}
                        role="tab"
                        aria-selected={isActive ? 'true' : 'false'}
                        title={lang.title}
                        onClick={() => onLanguageChange(lang.code)}
                    >
                        <span className="pill-text-full">{lang.full}</span>
                        <span className="pill-text-short">{lang.short}</span>
                    </button>
                );
            })}
        </div>
    );
};
