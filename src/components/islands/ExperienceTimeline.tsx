import { useState, useEffect, useRef, useCallback, type FC } from 'react';

/* ===== CUSTOM HOOKS ===== */

/** useTypewriter — types text character by character */
function useTypewriter(text: string, speed = 50, startDelay = 0) {
    const [displayed, setDisplayed] = useState('');
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        setDisplayed('');
        setIsComplete(false);
        let i = 0;
        const timeout = setTimeout(() => {
            const interval = setInterval(() => {
                if (i < text.length) {
                    setDisplayed(text.slice(0, i + 1));
                    i++;
                } else {
                    setIsComplete(true);
                    clearInterval(interval);
                }
            }, speed);
            return () => clearInterval(interval);
        }, startDelay);
        return () => clearTimeout(timeout);
    }, [text, speed, startDelay]);

    return { displayed, isComplete };
}

/** useIntersectionObserver — observe element visibility */
function useIntersectionObserver(options: IntersectionObserverInit = {}) {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsVisible(true);
                observer.disconnect();
            }
        }, { threshold: 0.15, ...options });

        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return { ref, isVisible };
}

/* ===== DATA ===== */
interface Job {
    role: string;
    company: string;
    location: string;
    period: string;
    highlights: string[];
    promoted?: boolean;
}

const jobs: Job[] = [
    {
        role: 'Senior Frontend Engineer',
        company: 'Cybernetic Labs',
        location: 'Istanbul, Turkey',
        period: '02/2024 – Present',
        promoted: true,
        highlights: [
            'Architected and implemented an AI-driven frontend generation system using a multi-agent framework',
            'Design and implement scalable front-end architectures, making informed decisions on frameworks and tools',
            'Implemented a Monorepo of NPM UI component libraries with CI/CD using Lerna & Nx',
            'Supervise and mentor a team while reviewing PRs and maintaining documentation',
        ],
    },
    {
        role: 'Frontend Engineer',
        company: 'Cybernetic Labs',
        location: 'Istanbul, Turkey',
        period: '10/2022 – 02/2024',
        highlights: [
            'Research and develop innovative frontend solutions using emerging technologies',
            'Created DevOps pipelines utilizing native deployment or Docker with Nginx',
            'Implemented automatic code generation using Microfrontends, Mako Templates, and Python',
        ],
    },
    {
        role: 'Web Developer (Erasmus+)',
        company: 'Megaventory',
        location: 'Athens, Greece',
        period: '04/2022 – 10/2022',
        highlights: [
            'Developed full-stack features in a production .NET environment',
            'Debugged and tested optimized application parts using Stackify Prefix and SQL Profiler',
            'Researched minification and bundling solutions for frontend assets in .NET',
        ],
    },
    {
        role: 'Frontend Developer',
        company: 'OptimumTek',
        location: 'Istanbul, Turkey',
        period: '06/2021 – 01/2022',
        highlights: [
            'Developed various UI projects utilizing Vue 2 & 3',
            'Integrated WebSockets using Socket.IO with VueJS for real-time features',
            'Managed handover of multiple UI solutions with ongoing support',
        ],
    },
];

/* ===== TIMELINE ENTRY ===== */
const TimelineEntry: FC<{ job: Job; index: number; isVisible: boolean }> = ({ job, index, isVisible }) => {
    const [expanded, setExpanded] = useState(false);
    const { displayed: typedRole, isComplete } = useTypewriter(
        job.role,
        40,
        isVisible ? index * 300 + 200 : 99999
    );

    const entryStyle: React.CSSProperties = {
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateX(0)' : `translateX(${index % 2 === 0 ? '-30px' : '30px'})`,
        transition: `all 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${index * 0.15}s`,
    };

    return (
        <div className="timeline-entry" style={entryStyle}>
            <div className="timeline-dot" />
            <div className="timeline-card">
                <div className="timeline-period">{job.period}</div>
                <h3 className="timeline-role">
                    {isVisible ? typedRole : ''}
                    {!isComplete && isVisible && <span className="cursor">|</span>}
                </h3>
                {job.promoted && <span className="promoted-badge">↑ Promoted</span>}
                <div className="timeline-meta">
                    <span className="timeline-company">{job.company}</span>
                    <span className="timeline-location">{job.location}</span>
                </div>
                <ul className={`timeline-highlights ${expanded ? 'expanded' : ''}`}>
                    {job.highlights.slice(0, expanded ? undefined : 2).map((h, i) => (
                        <li key={i}>{h}</li>
                    ))}
                </ul>
                {job.highlights.length > 2 && (
                    <button
                        className="expand-btn"
                        onClick={() => setExpanded(!expanded)}
                        aria-expanded={expanded}
                    >
                        {expanded ? '← Show less' : `Show ${job.highlights.length - 2} more →`}
                    </button>
                )}
            </div>
        </div>
    );
};

/* ===== MAIN COMPONENT ===== */
const ExperienceTimeline: FC = () => {
    const { ref, isVisible } = useIntersectionObserver();

    return (
        <div ref={ref} className="experience-wrapper">
            <div className="timeline">
                <div className="timeline-line" />
                {jobs.map((job, i) => (
                    <TimelineEntry key={i} job={job} index={i} isVisible={isVisible} />
                ))}
            </div>
            <div className="hooks-showcase">
                <div className="hook-card">
                    <code className="hook-name">useTypewriter()</code>
                    <span className="hook-desc">Custom hook — role titles type character by character</span>
                </div>
                <div className="hook-card">
                    <code className="hook-name">useIntersectionObserver()</code>
                    <span className="hook-desc">Custom hook — entries animate when scrolled into view</span>
                </div>
                <div className="hook-card">
                    <code className="hook-name">useState()</code>
                    <span className="hook-desc">Expand/collapse job highlights interactively</span>
                </div>
            </div>
        </div>
    );
};

export default ExperienceTimeline;
