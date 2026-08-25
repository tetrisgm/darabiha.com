"use client";

import { Canvas } from "@react-three/fiber";
import { Float, Line, OrbitControls, RoundedBox, Sparkles, Text } from "@react-three/drei";
import { AdditiveBlending, Color, type Vector3 } from "three";
import type { FamilyTree, Person } from "../../lib/types";

function levels(tree: FamilyTree) {
  const result = new Map(tree.people.map((person) => [person.id, 0]));
  for (let pass = 0; pass < tree.people.length; pass += 1) for (const link of tree.relationships.filter((r) => r.type === "parent")) {
    result.set(link.toPersonId, Math.max(result.get(link.toPersonId) ?? 0, (result.get(link.fromPersonId) ?? 0) + 1));
  }
  return result;
}

function layout(tree: FamilyTree) {
  const level = levels(tree);
  const groups = new Map<number, Person[]>();
  tree.people.forEach((person) => groups.set(level.get(person.id) ?? 0, [...(groups.get(level.get(person.id) ?? 0) ?? []), person]));
  const positions = new Map<string, Vector3>();
  [...groups.entries()].forEach(([depth, people]) => people.forEach((person, index) => {
    const spread = Math.max(people.length - 1, 1);
    positions.set(person.id, [(index - spread / 2) * 2.55, -depth * 2.15 + 1.8, Math.sin(index * 1.7 + depth) * 0.5] as Vector3);
  }));
  return positions;
}

function displayDate(value: string | null) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
  }
  return value;
}

function displayPlace(person: Person, kind: "birth" | "death") {
  const city = kind === "birth" ? person.birthCity : person.deathCity;
  const country = kind === "birth" ? person.birthCountry : person.deathCountry;
  const legacy = kind === "birth" ? person.birthPlace : person.deathPlace;
  return [city, country].filter(Boolean).join(", ") || legacy || null;
}

function slabDetails(person: Person) {
  const born = person.birthDate || displayPlace(person, "birth");
  const bornText = born ? `Born${person.birthDate ? ` ${displayDate(person.birthDate)}` : ""}${displayPlace(person, "birth") ? ` in ${displayPlace(person, "birth")}` : ""}` : "Birth details unknown";
  if (!person.deathDate && !displayPlace(person, "death")) return bornText;
  return `${bornText}  ·  Died${person.deathDate ? ` ${displayDate(person.deathDate)}` : ""}${displayPlace(person, "death") ? ` in ${displayPlace(person, "death")}` : ""}`;
}

function PersonOrb({ person, position, onSelect }: { person: Person; position: Vector3; onSelect: (person: Person) => void }) {
  return <Float speed={0} rotationIntensity={0} floatIntensity={0}><group position={position} onClick={(event) => { event.stopPropagation(); onSelect(person); }}>
    <RoundedBox args={[2.05, 1.3, 0.08]} radius={0.12} smoothness={5}><meshStandardMaterial color="#30384b" roughness={0.32} metalness={0.12} emissive="#4d5f89" emissiveIntensity={0.42} /></RoundedBox>
    <mesh position={[0, 0.28, 0.052]}><planeGeometry args={[1.82, 0.52]} /><meshBasicMaterial color="#424d67" /></mesh>
    <Text position={[-0.82, -0.02, 0.06]} anchorX="left" anchorY="middle" maxWidth={1.7} fontSize={0.16} color="#ffffff" outlineWidth={0.004} outlineColor="#000000">{person.displayName}</Text>
    <Text position={[-0.82, -0.28, 0.06]} anchorX="left" anchorY="middle" maxWidth={1.7} fontSize={0.085} color="#aeb8c8" lineHeight={1.2}>{slabDetails(person)}</Text>
    <mesh scale={1.12}><boxGeometry args={[2.05, 1.3, 0.08]} /><meshBasicMaterial color="#5b8cff" transparent opacity={0.06} blending={AdditiveBlending} /></mesh>
  </group></Float>;
}

export function FamilyTreeCanvas({ tree, onSelect }: { tree: FamilyTree; onSelect: (person: Person) => void }) {
  const positions = layout(tree);
  return <div className="family-canvas"><Canvas camera={{ position: [0, 0, 13], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true }}>
    <color attach="background" args={[new Color("#111827")]} /><fog attach="fog" args={["#111827", 12, 32]} />
    <ambientLight intensity={0.35} /><pointLight position={[0, 4, 6]} color="#fff7e8" intensity={45} distance={18} /><pointLight position={[-8, -4, 4]} color="#4d7cff" intensity={30} distance={20} /><pointLight position={[8, 1, -2]} color="#b86cff" intensity={22} distance={18} />
    <Sparkles count={140} scale={[24, 16, 12]} size={1.8} speed={0.12} color="#8ba7ff" />
    {tree.relationships.map((link) => { const from = positions.get(link.fromPersonId); const to = positions.get(link.toPersonId); if (!from || !to) return null; const mid: Vector3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.18, (from[2] + to[2]) / 2 + 0.4] as Vector3; return <group key={link.id}><Line points={[from, mid, to]} color={link.type === "spouse" ? "#8b5cf6" : "#147ef5"} lineWidth={1.2} transparent opacity={0.72} /><Line points={[from, mid, to]} color={link.type === "spouse" ? "#8b5cf6" : "#147ef5"} lineWidth={5} transparent opacity={0.07} blending={AdditiveBlending} /></group>; })}
    {[...positions.entries()].map(([id, position]) => { const person = tree.people.find((candidate) => candidate.id === id); return person ? <PersonOrb key={id} person={person} position={position} onSelect={onSelect} /> : null; })}
    <OrbitControls enablePan enableRotate={false} minDistance={5} maxDistance={24} zoomSpeed={0.8} panSpeed={0.8} /></Canvas></div>;
}
