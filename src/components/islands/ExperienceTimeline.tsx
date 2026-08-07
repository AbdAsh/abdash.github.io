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

/**
 * Source of truth: "Abdulrahman Mahmutoglu - Senior AI Fullstack Engineer.pdf".
 * The concierge's dossier is GENERATED from this array by scripts/build-dossier.ts,
 * so an edit here is also an edit to what the voice agent says out loud — run
 * `npm run dossier` after changing it, and redeploy concierge-turn.
 *
 * `period` must keep the `MM/YYYY` shape; the dossier builder parses it to sort
 * the timeline and throws rather than emitting an undated job.
 */
const jobs: Job[] = [
    {
        role: 'Senior AI Fullstack Engineer',
        company: 'Apex Health',
        location: 'Lusail, Qatar',
        period: '02/2026 – Present',
        highlights: [
            'Design and implement AI-driven automation across departments, with minimal disruption to running operations',
            'Work cross-functionally to find operational pain points and deploy automation aimed at those specifically',
        ],
    },
    {
        role: 'Senior Software Engineer',
        company: 'Cybernetic Labs',
        location: 'Istanbul, Turkey',
        period: '02/2024 – 03/2026',
        promoted: true,
        highlights: [
            'Architected an agentic AI system for automated business plan creation: LLM-powered multi-agent pipelines with enforced JSON schema output',
            'Designed and deployed RAG pipelines backed by vector databases for contextual retrieval and document segmentation',
            'Built AI agents for document editing, refinement and template extraction; orchestrated the workflows end to end with n8n and MCP servers',
            'Implemented a monorepo of NPM component libraries with CI/CD using Lerna and Nx; ran code review and mentoring',
            'Built secure web interfaces talking to the AI systems over authenticated webhooks, deployed in Docker behind Nginx',
        ],
    },
    {
        role: 'Frontend Engineer',
        company: 'Cybernetic Labs',
        location: 'Istanbul, Turkey',
        period: '10/2022 – 02/2024',
        highlights: [
            'Developed an AI-driven frontend generation system using micro-frontends, Mako templates and Python scripting to automate UI creation',
            'Built reusable component libraries with Vue 2/3, Nuxt 2/3, Storybook and SCSS; configured Webpack and the DevOps pipelines',
        ],
    },
    {
        role: 'Web Developer (Erasmus+)',
        company: 'Megaventory',
        location: 'Athens, Greece',
        period: '05/2022 – 08/2022',
        highlights: [
            'Developed full-stack features in a production .NET environment',
            'Profiled and optimised application performance using SQL Profiler and Stackify Prefix',
        ],
    },
    {
        role: 'Frontend Developer',
        company: 'OptimumTek / Cybernetic Labs',
        location: 'Istanbul, Turkey',
        period: '06/2021 – 04/2022',
        highlights: [
            'Built responsive UI with Vue 2/3, Nuxt and SCSS',
            'Integrated real-time features over Socket.IO and worked in a Storybook component system',
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
