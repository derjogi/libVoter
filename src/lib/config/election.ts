export interface ElectionConfig {
  location: string;
  year: number;
  type: string;
  keyTopics: string[];
  description: string;
}

export const electionConfig: ElectionConfig = {
  location: "Auckland, New Zealand",
  year: 2025,
  type: "Local Council Elections",
  keyTopics: ["Housing", "Transport", "Environment", "Economy", "Infrastructure", "Community Services"],
  description: "Auckland Council local elections for mayor and ward representatives"
};