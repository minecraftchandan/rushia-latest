/**
 * Advanced Card Search System
 * Deeply understands cards.json structure for accurate matching
 */

function normalizeString(str) {
  return str.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(str) {
  return normalizeString(str).split(' ').filter(w => w.length > 0);
}

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,
        matrix[j][i - 1] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  
  return matrix[b.length][a.length];
}

function calculateNameScore(query, cardName) {
  const queryNorm = normalizeString(query);
  const nameNorm = normalizeString(cardName);
  
  // Exact match
  if (queryNorm === nameNorm) return 100;
  
  // Exact substring match (strict)
  if (nameNorm.includes(queryNorm)) {
    const ratio = queryNorm.length / nameNorm.length;
    return 90 + (ratio * 10);
  }
  
  // Starts with query
  if (nameNorm.startsWith(queryNorm)) return 85;
  
  // Word-based matching (strict)
  const queryWords = tokenize(query);
  const nameWords = tokenize(cardName);
  
  if (queryWords.length === 0 || nameWords.length === 0) return 0;
  
  let exactMatches = 0;
  let partialMatches = 0;
  let fuzzyMatches = 0;
  
  for (const qw of queryWords) {
    let bestMatch = 0;
    for (const nw of nameWords) {
      if (qw === nw) {
        exactMatches++;
        bestMatch = Math.max(bestMatch, 3);
      } else if (nw.includes(qw) && qw.length >= 4) {
        partialMatches++;
        bestMatch = Math.max(bestMatch, 2);
      } else if (qw.includes(nw) && nw.length >= 4) {
        partialMatches++;
        bestMatch = Math.max(bestMatch, 2);
      } else {
        const dist = levenshteinDistance(qw, nw);
        const maxLen = Math.max(qw.length, nw.length);
        const threshold = maxLen >= 4 ? 1 : 0;
        if (dist <= threshold) {
          fuzzyMatches++;
          bestMatch = Math.max(bestMatch, 1);
        }
      }
    }
    if (bestMatch === 0) return 0;
  }
  
  const totalWords = queryWords.length;
  const matchRatio = (exactMatches * 3 + partialMatches * 2 + fuzzyMatches) / (totalWords * 3);
  
  if (exactMatches === totalWords) return 80;
  if (exactMatches + partialMatches === totalWords) return 70;
  
  return Math.min(65, matchRatio * 100);
}

function calculateSeriesScore(query, series) {
  const queryNorm = normalizeString(query);
  const seriesNorm = normalizeString(series);
  
  if (queryNorm === seriesNorm) return 50;
  if (seriesNorm.includes(queryNorm)) return 40;
  if (seriesNorm.startsWith(queryNorm)) return 35;
  
  const queryWords = tokenize(query);
  const seriesWords = tokenize(series);
  
  let matches = 0;
  for (const qw of queryWords) {
    if (seriesWords.some(sw => sw === qw || sw.includes(qw) || qw.includes(sw))) {
      matches++;
    }
  }
  
  if (matches > 0) {
    return Math.min(30, (matches / queryWords.length) * 30);
  }
  
  return 0;
}

function calculateElementScore(query, element) {
  const queryNorm = normalizeString(query);
  const elementNorm = normalizeString(element);
  
  if (queryNorm === elementNorm) return 20;
  if (elementNorm.includes(queryNorm) || queryNorm.includes(elementNorm)) return 15;
  
  return 0;
}

function calculateRoleScore(query, role) {
  const queryNorm = normalizeString(query);
  const roleNorm = normalizeString(role);
  
  if (queryNorm === roleNorm) return 15;
  if (roleNorm.includes(queryNorm) || queryNorm.includes(roleNorm)) return 10;
  
  return 0;
}

function calculateIconicBonus(card) {
  return card.is_iconic ? 5 : 0;
}

function searchCards(query, allCards, limit = 10) {
  if (!query || query.trim().length === 0) return [];
  
  const results = allCards.map(card => {
    const nameScore = calculateNameScore(query, card.name);
    const seriesScore = calculateSeriesScore(query, card.series);
    const elementScore = calculateElementScore(query, card.element);
    const roleScore = calculateRoleScore(query, card.role);
    const iconicBonus = calculateIconicBonus(card);
    
    const totalScore = nameScore + seriesScore + elementScore + roleScore + iconicBonus;
    
    return {
      card,
      scores: { nameScore, seriesScore, elementScore, roleScore, iconicBonus },
      totalScore
    };
  })
  .filter(result => result.totalScore > 30)
  .sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (b.scores.nameScore !== a.scores.nameScore) {
      return b.scores.nameScore - a.scores.nameScore;
    }
    return a.card.name.length - b.card.name.length;
  })
  .slice(0, limit);
  
  return results.map(r => r.card);
}

module.exports = { searchCards };
