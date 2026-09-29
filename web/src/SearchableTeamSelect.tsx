import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

const commonTeams = [
  "AC Milan",
  "Ajax",
  "Arsenal",
  "Atalanta",
  "Atletico Madrid",
  "Athletic Club",
  "Barcelona",
  "Bayer Leverkusen",
  "Bayern Munich",
  "Benfica",
  "Borussia Dortmund",
  "Chelsea",
  "Celtic",
  "Feyenoord",
  "Inter Milan",
  "Juventus",
  "Liverpool",
  "Manchester City",
  "Manchester United",
  "Napoli",
  "Newcastle United",
  "Paris Saint-Germain",
  "Porto",
  "PSV Eindhoven",
  "Real Madrid",
  "Real Sociedad",
  "Roma",
  "Sevilla",
  "Sporting CP",
  "Tottenham Hotspur",
  "Valencia",
  "Villarreal",
];

interface SearchableTeamSelectProps {
  id: string;
  value: string;
  onChange: (team: string) => void;
  required?: boolean;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function SearchableTeamSelect({ id, value, onChange, required = true }: SearchableTeamSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);

  const teams = useMemo(() => {
    if (value && !commonTeams.some((team) => normalize(team) === normalize(value))) {
      return [value, ...commonTeams];
    }
    return commonTeams;
  }, [value]);
  const filteredTeams = useMemo(() => {
    const search = normalize(query);
    return teams.filter((team) => !search || normalize(team).includes(search));
  }, [query, teams]);
  const addCustomTeam = Boolean(query.trim())
    && !teams.some((team) => normalize(team) === normalize(query));

  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
  }, [isOpen]);

  function choose(team: string) {
    onChange(team);
    setQuery("");
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(event.relatedTarget as Node | null)) setIsOpen(false);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      optionRefs.current[0]?.focus();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const exactMatch = filteredTeams.find((team) => normalize(team) === normalize(query));
      if (exactMatch) choose(exactMatch);
      else if (filteredTeams.length === 1) choose(filteredTeams[0]);
      else if (addCustomTeam && filteredTeams.length === 0) choose(query.trim());
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number, team: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(team);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      optionRefs.current[index + 1]?.focus();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) searchRef.current?.focus();
      else optionRefs.current[index - 1]?.focus();
    }
  }

  const optionCount = filteredTeams.length + Number(addCustomTeam);

  return (
    <div className="team-select" ref={containerRef} onBlur={handleBlur}>
      <button
        id={id}
        ref={triggerRef}
        className={`team-select-trigger text-input${value ? " has-value" : ""}`}
        type="button"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-options`}
        aria-required={required}
        aria-invalid={required && !value.trim()}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span id={`${id}-value`}>{value || "搜索并选择球队"}</span>
        <span className="team-select-chevron" aria-hidden="true">⌄</span>
      </button>
      {isOpen && (
        <div className="team-select-menu">
          <input
            ref={searchRef}
            className="team-search-input"
            type="search"
            aria-label="搜索球队"
            aria-controls={`${id}-options`}
            placeholder="输入球队名称搜索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <div className="team-select-options" id={`${id}-options`} role="listbox" aria-label="球队选项">
            {filteredTeams.map((team, index) => (
              <div
                key={team}
                ref={(element) => { optionRefs.current[index] = element; }}
                className={`team-select-option${team === value ? " selected" : ""}`}
                role="option"
                aria-selected={team === value}
                tabIndex={0}
                onClick={() => choose(team)}
                onKeyDown={(event) => handleOptionKeyDown(event, index, team)}
              >
                <span>{team}</span>
                {team === value && <span aria-hidden="true">✓</span>}
              </div>
            ))}
            {addCustomTeam && (
              <div
                ref={(element) => { optionRefs.current[filteredTeams.length] = element; }}
                className="team-select-option add-team-option"
                role="option"
                aria-selected={false}
                tabIndex={0}
                onClick={() => choose(query.trim())}
                onKeyDown={(event) => handleOptionKeyDown(event, filteredTeams.length, query.trim())}
              >
                <span>使用“{query.trim()}”</span>
                <span>添加</span>
              </div>
            )}
            {optionCount === 0 && <p className="team-select-empty">没有匹配的球队。</p>}
          </div>
        </div>
      )}
    </div>
  );
}
