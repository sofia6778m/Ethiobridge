const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.text());

app.post('/log-error', (req, res) => {
  console.log('==== REACT RUNTIME ERROR ====');
  console.log(req.body);
  console.log('=============================');
  res.send('ok');
});

app.listen(9999, () => console.log('Error logger listening on port 9999'));
