'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, SortAsc, SortDesc } from 'lucide-react';
import { CandidateCard } from './CandidateCard';
import type { CandidateMatch } from '@/types';

interface CandidateListProps {
  candidates: CandidateMatch[];
  confidence: number;
  onSelectCandidate: (candidate: CandidateMatch) => void;
  isLoading?: boolean;
}

type SortOption = 'score' | 'name' | 'party';
type FilterOption = 'all' | 'high' | 'medium' | 'low';

export function CandidateList({
  candidates,
  confidence,
  onSelectCandidate,
  isLoading = false
}: CandidateListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  const isLowConfidence = confidence < 60; // AI_CONFIDENCE_THRESHOLD

  const filteredAndSortedCandidates = useMemo(() => {
    let filtered = candidates.filter(candidate => {
      // Search filter
      const matchesSearch = !searchQuery ||
        candidate.candidate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.candidate.party.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.topMatchingPolicies.some(policy =>
          policy.toLowerCase().includes(searchQuery.toLowerCase())
        );

      // Score filter
      const matchesFilter = filterBy === 'all' ||
        (filterBy === 'high' && candidate.score >= 80) ||
        (filterBy === 'medium' && candidate.score >= 60 && candidate.score < 80) ||
        (filterBy === 'low' && candidate.score < 60);

      return matchesSearch && matchesFilter;
    });

    // Sort
    filtered.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case 'score':
          aValue = a.score;
          bValue = b.score;
          break;
        case 'name':
          aValue = a.candidate.name.toLowerCase();
          bValue = b.candidate.name.toLowerCase();
          break;
        case 'party':
          aValue = a.candidate.party.toLowerCase();
          bValue = b.candidate.party.toLowerCase();
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return 0;
    });

    return filtered;
  }, [candidates, searchQuery, sortBy, sortOrder, filterBy]);

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-muted rounded-lg"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search candidates, parties, or policies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterBy} onValueChange={(value: FilterOption) => setFilterBy(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Matches</SelectItem>
                <SelectItem value="high">High (80%+)</SelectItem>
                <SelectItem value="medium">Medium (60-79%)</SelectItem>
                <SelectItem value="low">Low (less than 60%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSortOrder}
              className="flex items-center space-x-1"
            >
              {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
              <span>Sort</span>
            </Button>
            <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">By Score</SelectItem>
                <SelectItem value="name">By Name</SelectItem>
                <SelectItem value="party">By Party</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Badge variant="outline">
            {filteredAndSortedCandidates.length} candidate{filteredAndSortedCandidates.length !== 1 ? 's' : ''}
          </Badge>
          {isLowConfidence && (
            <Badge variant="secondary">
              Building confidence...
            </Badge>
          )}
        </div>
      </div>

      {/* Candidate Grid */}
      {filteredAndSortedCandidates.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground">
            {searchQuery || filterBy !== 'all' ? (
              <p>No candidates match your current filters.</p>
            ) : (
              <p>No candidates available yet. Continue answering questions to see matches.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
            {filteredAndSortedCandidates.map((candidate) => {
              console.log("Candidate: ", candidate)
              return (
                <CandidateCard
                  key={candidate.candidate.id}
                  candidate={candidate}
                  onSelect={onSelectCandidate}
                  confidence={confidence}
                  isLowConfidence={isLowConfidence}
                />
              )
            })}
        </div>
      )}
    </div>
  );
}