const recruitmentVerbs = /寻找|找|引进|补强|物色|招募|签下/gu;
const targetMarkers = /为|帮|给/gu;
const clauseBreaks = /[，,。；;！？!?]/gu;
const genericSubjects = new Set(["我", "我们", "你", "你们", "他", "她", "他们", "大家"]);

function chineseTargetTeams(text: string): string[] {
  const teams: string[] = [];
  for (const verb of text.matchAll(recruitmentVerbs)) {
    const verbIndex = verb.index ?? 0;
    const precedingText = text.slice(0, verbIndex);
    const clauseStarts = [...precedingText.matchAll(clauseBreaks)].map((match) => (match.index ?? 0) + 1);
    const clause = precedingText.slice(clauseStarts.at(-1) ?? 0);
    const markers = [...clause.matchAll(targetMarkers)];
    const lastMarker = markers.at(-1);
    if (!lastMarker || lastMarker.index === undefined) continue;

    const candidate = clause.slice(lastMarker.index + lastMarker[0].length).trim();
    if (!candidate || candidate.length > 36 || genericSubjects.has(candidate)) continue;
    if (/[，,。；;！？!?\n]|寻找|找|引进|补强|物色|招募|签下/.test(candidate)) continue;
    teams.push(candidate.replace(/\s+/g, " "));
  }
  return teams;
}

function englishFrontedTargetTeams(text: string): string[] {
  const pattern = /(?:^|[.!?;]\s*)(?:for|at)\s+([A-Z][A-Za-z0-9&.'’-]*(?:\s+[A-Z][A-Za-z0-9&.'’-]*){0,4})(?=\s*[,;:.!?]|$)/gim;
  return [...text.matchAll(pattern)].map((match) => match[1]?.trim()).filter((value): value is string => Boolean(value));
}

/** Extracts a target club only from an explicit recruitment-target phrase. */
export function extractExplicitTargetTeam(text: string): string | null {
  const candidates = [...chineseTargetTeams(text), ...englishFrontedTargetTeams(text)];
  const unique = [...new Map(candidates.map((value) => [value.toLocaleLowerCase(), value])).values()];
  return unique.length === 1 ? unique[0]! : null;
}
