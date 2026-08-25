export type Person = {
  id: string;
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  deathPlace: string | null;
  birthCity: string | null;
  birthCountry: string | null;
  deathCity: string | null;
  deathCountry: string | null;
  biography: string | null;
  photoAttachmentId: string | null;
};

export type Relationship = {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  type: "parent" | "spouse";
};

export type Story = {
  id: string;
  title: string;
  body: string;
  date: string | null;
  place: string | null;
  personIds: string[];
};

export type Attachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
};

export type FamilyTree = {
  people: Person[];
  relationships: Relationship[];
  stories: Story[];
};

export type AddPersonProposal = {
  kind: "add_person";
  summary: string;
  person: Omit<Person, "id">;
  relationshipHints?: Array<{ personName: string; relationshipType: "parent" | "spouse" }>;
};

export type UpdatePersonProposal = {
  kind: "update_person";
  summary: string;
  personId: string;
  patch: Omit<Person, "id">;
};

export type AddRelationshipProposal = {
  kind: "add_relationship";
  summary: string;
  fromPersonId: string;
  toPersonId: string;
  relationshipType: "parent" | "spouse";
};

export type AddStoryProposal = {
  kind: "add_story";
  summary: string;
  title: string;
  body: string;
  date: string | null;
  place: string | null;
  personIds: string[];
  attachmentIds: string[];
};

export type ChangeProposal =
  | AddPersonProposal
  | UpdatePersonProposal
  | AddRelationshipProposal
  | AddStoryProposal;
