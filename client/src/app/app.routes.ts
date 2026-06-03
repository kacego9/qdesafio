import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'how-to-play',
    loadComponent: () => import('./pages/how-to-play/how-to-play.component').then(m => m.HowToPlayComponent)
  },
  {
    path: 'levels',
    loadComponent: () => import('./pages/levels/levels.component').then(m => m.LevelsComponent)
  },
  {
    path: 'leaderboard',
    loadComponent: () => import('./pages/leaderboard/leaderboard.component').then(m => m.LeaderboardComponent)
  },
  {
    path: 'solo/:id',
    loadComponent: () => import('./pages/solo/solo.component').then(m => m.SoloComponent)
  },
  {
    path: 'solo',
    redirectTo: '/levels',
    pathMatch: 'full'
  },
  {
    path: 'create',
    loadComponent: () => import('./pages/create-room/create-room.component').then(m => m.CreateRoomComponent)
  },
  {
    path: 'join',
    loadComponent: () => import('./pages/join-room/join-room.component').then(m => m.JoinRoomComponent)
  },
  {
    path: 'join/:code',
    loadComponent: () => import('./pages/join-room/join-room.component').then(m => m.JoinRoomComponent)
  },
  {
    path: 'room/:code',
    loadComponent: () => import('./pages/room/room.component').then(m => m.RoomComponent)
  },
  { path: '', pathMatch: 'full', redirectTo: '/home' },
  {
    path: '**',
    loadComponent: () => import('./pages/error/error.component').then(m => m.ErrorComponent)
  }
];
