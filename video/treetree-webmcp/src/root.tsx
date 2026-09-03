import React from 'react';
import {Composition} from 'remotion';
import {TreeTreeWebMCP, TOTAL, fps} from './comp';

export const Root: React.FC = () => (
  <Composition id="TreeTreeWebMCP" component={TreeTreeWebMCP} durationInFrames={TOTAL} fps={fps} width={1280} height={720} />
);
