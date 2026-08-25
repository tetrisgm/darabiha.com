"use client";

import { Canvas } from "@react-three/fiber";
import { Float, Html, Line, OrbitControls, Sparkles } from "@react-three/drei";
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

function PersonOrb({ person, position, onSelect }: { person: Person; position: Vector3; onSelect: (person: Person) => void }) {
  return <Float speed={1.4} rotationIntensity={0.12} floatIntensity={0.18}><group position={position} onClick={(event) => { event.stopPropagation(); onSelect(person); }}>
    <mesh><sphereGeometry args={[0.28, 24, 24]} /><meshStandardMaterial color="#f4efe5" emissive="#ff8b62" emissiveIntensity={1.2} /></mesh>
    <mesh scale={1.8}><sphereGeometry args={[0.28, 16, 16]} /><meshBasicMaterial color="#ff805f" transparent opacity={0.12} blending={AdditiveBlending} /></mesh>
    <Html center distanceFactor={8} position={[0, 0.58, 0]}><button className="three-person-label" onClick={(event) => { event.stopPropagation(); onSelect(person); }}><strong>{person.displayName}</strong><span>{person.birthDate || "Year unknown"}</span></button></Html>
  </group></Float>;
}

export function FamilyTreeCanvas({ tree, onSelect }: { tree: FamilyTree; onSelect: (person: Person) => void }) {
  const positions = layout(tree);
  return <div className="family-canvas"><Canvas camera={{ position: [0, 0, 13], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true }}>
    <color attach="background" args={[new Color("#f5f5f7")]} /><fog attach="fog" args={["#f5f5f7", 9, 24]} />
    <ambientLight intensity={0.7} /><pointLight position={[0, 3, 4]} color="#ffffff" intensity={20} distance={12} /><pointLight position={[-5, -5, 2]} color="#7d8cff" intensity={12} distance={14} />
    <Sparkles count={65} scale={[16, 10, 8]} size={1.5} speed={0.18} color="#7d8cff" />
    {tree.relationships.map((link) => { const from = positions.get(link.fromPersonId); const to = positions.get(link.toPersonId); if (!from || !to) return null; const mid: Vector3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.18, (from[2] + to[2]) / 2 + 0.4] as Vector3; return <group key={link.id}><Line points={[from, mid, to]} color={link.type === "spouse" ? "#8b5cf6" : "#147ef5"} lineWidth={1.2} transparent opacity={0.72} /><Line points={[from, mid, to]} color={link.type === "spouse" ? "#8b5cf6" : "#147ef5"} lineWidth={5} transparent opacity={0.07} blending={AdditiveBlending} /></group>; })}
    {[...positions.entries()].map(([id, position]) => { const person = tree.people.find((candidate) => candidate.id === id); return person ? <PersonOrb key={id} person={person} position={position} onSelect={onSelect} /> : null; })}
    <OrbitControls enablePan={false} minDistance={7} maxDistance={18} autoRotate autoRotateSpeed={0.18} /></Canvas></div>;
}
