import ConnectFour from './ConnectFour/ConnectFour';
import Ludo from './Ludo/Ludo';
import SnakesAndLadders from './SnakesAndLadders/SnakesAndLadders';
import Yatzy from './Yatzy/Yatzy';
import UltimateTicTacToe from './UltimateTicTacToe/UltimateTicTacToe';
import Checkers from './Checkers/Checkers';
import AirHockey from './AirHockey/AirHockey';
import Memory from './Memory/Memory';

// Ett sted å registrere nye spill – legg til en rad her når et nytt spill
// bygges (Stigespill, Yatzy, ...), resten av GameShell (meny,
// spilleroppsett, resultat/highscore) trenger ingen endring.
export const GAMES = [
  {
    key: 'ludo',
    name: 'Ludo',
    icon: '🧩',
    minPlayers: 2,
    maxPlayers: 4,
    Component: Ludo,
  },
  {
    key: 'yatzy',
    name: 'Yatzy',
    icon: '🎲',
    minPlayers: 2,
    maxPlayers: 4,
    Component: Yatzy,
  },
  {
    key: 'snakes-and-ladders',
    name: 'Stigespill',
    icon: '🪜',
    minPlayers: 2,
    maxPlayers: 4,
    Component: SnakesAndLadders,
  },
  {
    key: 'connect-four',
    name: 'Fire på rad',
    icon: '🔴',
    minPlayers: 2,
    maxPlayers: 2,
    Component: ConnectFour,
  },
  {
    key: 'memory',
    name: 'Memory',
    icon: '🍎',
    minPlayers: 2,
    maxPlayers: 4,
    Component: Memory,
  },
  {
    key: 'air-hockey',
    name: 'Airhockey',
    icon: '🏒',
    minPlayers: 2,
    maxPlayers: 2,
    Component: AirHockey,
  },
  {
    key: 'checkers',
    name: 'Dam',
    icon: '⚫',
    minPlayers: 2,
    maxPlayers: 2,
    Component: Checkers,
  },
  {
    key: 'ultimate-tic-tac-toe',
    name: 'Utvidet tre-på-rad',
    icon: '⭕',
    minPlayers: 2,
    maxPlayers: 2,
    Component: UltimateTicTacToe,
  },
];
