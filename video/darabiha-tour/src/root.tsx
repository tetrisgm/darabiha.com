import React from 'react';
import {Composition} from 'remotion';
import {DarabihaTour} from './tour';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="DarabihaTour"
    component={DarabihaTour}
    durationInFrames={870}
    fps={30}
    width={1920}
    height={1080}
  />
);
