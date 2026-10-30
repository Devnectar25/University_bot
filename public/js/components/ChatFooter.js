// ChatFooter.js - Bottom input bar with Web Speech API voice recording and send controls
window.GUNi = window.GUNi || {};

const { useState, useEffect, useRef } = React;

window.GUNi.ChatFooter = function ChatFooter({
    inputText,
    setInputText,
    onSend,
    isSending,
    t,
    currentLanguage
}) {
    const [isListening, setIsListening] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [showToast, setShowToast] = useState(false);
    const toastTimerRef = useRef(null);
    const recognitionRef = useRef(null);

    const triggerToast = (msg, ms = 3000) => {
        setToastMessage(msg);
        setShowToast(true);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
            setShowToast(false);
        }, ms);
    };

    // Initialize Web Speech API
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            recognitionRef.current = null;
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = t?.voiceLang || 'en-IN';

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (e) => {
            let interim = '';
            let final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const transcript = e.results[i][0].transcript;
                if (e.results[i].isFinal) {
                    final += transcript;
                } else {
                    interim += transcript;
                }
            }
            const combined = final || interim;
            if (combined) {
                setInputText(combined);
            }
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.onerror = (e) => {
            setIsListening(false);
            const errorMessages = {
                'not-allowed': '🎙️ Microphone access was denied.',
                'no-speech': t?.voiceNoSpeech || 'No speech detected. Try again.',
                'network': '🎙️ Network connection error.'
            };
            if (errorMessages[e.error]) {
                triggerToast(errorMessages[e.error]);
            }
        };

        recognitionRef.current = recognition;

        return () => {
            try {
                recognition.abort();
            } catch {}
        };
    }, [currentLanguage, t]);

    const handleMicClick = () => {
        if (!recognitionRef.current) {
            triggerToast(t?.voiceUnsupported || 'Voice input is not supported in this browser.');
            return;
        }

        if (isListening) {
            try {
                recognitionRef.current.stop();
            } catch {}
            setIsListening(false);
        } else {
            try {
                if (recognitionRef.current) {
                    recognitionRef.current.lang = t?.voiceLang || 'en-IN';
                    recognitionRef.current.start();
                    triggerToast(t?.voiceListening || '🎙️ Listening… speak now', 2000);
                }
            } catch (err) {
                console.warn('Speech recognition start failed:', err);
            }
        }
    };

    const handleSubmit = (e) => {
        if (e) e.preventDefault();
        if (isListening && recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch {}
        }
        onSend();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <footer className="chat-footer">
            <form id="chat-form" onSubmit={handleSubmit} autoComplete="off">
                <div className="input-shell">
                    <input
                        type="text"
                        id="chat-input"
                        className="chat-input"
                        placeholder={
                            isListening
                                ? (t?.voiceListening || '🎙️ Listening…')
                                : (t?.inputPlaceholder || 'Ask anything about Ganpat University…')
                        }
                        aria-label="Chat message input"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isSending}
                    />
                    <button
                        type="button"
                        className={`input-action-btn${isListening ? ' listening' : ''}`}
                        id="mic-btn"
                        title={isListening ? 'Stop listening' : 'Voice input'}
                        aria-label="Voice input"
                        onClick={handleMicClick}
                    >
                        <i
                            className={isListening ? 'bi bi-stop-fill' : 'bi bi-mic-fill'}
                            id="mic-icon"
                        ></i>
                    </button>
                    <button
                        type="submit"
                        className="send-btn"
                        id="send-btn"
                        aria-label="Send message"
                        disabled={isSending || !inputText.trim()}
                        title={isSending ? 'Waiting for answer…' : 'Send message'}
                    >
                        <i className="bi bi-send-fill" style={{ pointerEvents: 'none' }}></i>
                    </button>
                </div>
                <div className="input-hint">
                    Powered By{' '}
                    <a
                        href="https://devnectar.in"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        devNectar
                    </a>
                </div>
            </form>
            <div className={`voice-toast${showToast ? ' show' : ''}`} id="voice-toast">
                {toastMessage}
            </div>
        </footer>
    );
};

