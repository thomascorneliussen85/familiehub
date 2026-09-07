import ConnectFour from './ConnectFour/ConnectFour';

// Ett sted å registrere nye spill – legg til en rad her når et nytt spill
// bygges (Ludo, Stigespill, Yatzy, ...), resten av GameShell (meny,
// spilleroppsett, resultat/highscore) trenger ingen endring.
export const GAMES = [
  {
    key: 'connect-four',
    name: 'Fire på rad',
    icon: '🔴',
    minPlayers: 2,
    maxPlayers: 2,
    Component: ConnectFour,
  },
];
