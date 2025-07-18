import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

import tripsRouter from './api/routes/trips';
import usersRouter from './api/routes/users';

app.use(express.json());

import collaborationRouter from './api/routes/collaboration';

import aiRouter from './api/routes/ai';

app.use('/trips', tripsRouter);
app.use('/users', usersRouter);
app.use('/collaboration', collaborationRouter);
app.use('/ai', aiRouter);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
