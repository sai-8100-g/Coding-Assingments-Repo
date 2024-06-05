const express = require('express')
const app = express()
app.use(express.json())

const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')

const sqlite3 = require('sqlite3')
const {open} = require('sqlite')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

let db = null

const intializer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000)
  } catch (e) {
    console.log(`DB error : ${e.message}`)
    process.exit(1)
  }
}

intializer()

const authenticateToken = async (request, response, next) => {
  let jwtToken = null
  const headerInfo = request.headers['authorization']
  if (headerInfo !== undefined) {
    jwtToken = headerInfo.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    await jwt.verify(jwtToken, 'SECRET_TOKEN', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const userCheck = `
    SELECT 
    * 
    FROM 
    user
    WHERE 
    username LIKE '${username}';`

  const result = await db.get(userCheck)
  if (result !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hasedPassword = await bcrypt.hash(password, 10)
      const postingQurey = `
        INSERT INTO 
        user(username, password, name, gender)
        VALUES('${username}', '${hasedPassword}',
                '${name}', '${gender}')
        `
      await db.run(postingQurey)
      response.send('User created successfully')
    }
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const userCheck = `
  SELECT 
  * 
  FROM 
  user
  WHERE
  username LIKE '${username}';`
  const result = await db.get(userCheck)
  if (result === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    isPasswordMatched = await bcrypt.compare(password, result.password)
    if (isPasswordMatched === false) {
      response.status(400)
      response.send('Invalid password')
    } else {
      const payload = {
        username: username,
      }
      const jwtToken = await jwt.sign(payload, 'SECRET_TOKEN')
      response.send({
        jwtToken: jwtToken,
      })
    }
  }
})

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const getFollowerDetails = `
  SELECT
  g.username,
  g.tweet,
  g.date_time
  FROM
  (user as u NATURAL JOIN tweet as t) as g INNER JOIN follower as f ON 
  g.user_id = f.follower_user_id
  WHERE
  g.username = '${username}'
  ORDER BY
  date_time DESC
  LIMIT 4;
  `
  const result = await db.all(getFollowerDetails)
  result.map(eachObj => {
    console.log(eachObj)
  })
})

module.exports = app
