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
  const getUserFollowsTweet = `
  SELECT
  user.username,
  tweet.tweet,
  tweet.date_time as dateTime
  FROM
  user INNER JOIN tweet ON user.user_id = tweet.user_id 
  WHERE
  user.user_id IN (SELECT 
                   f.following_user_id 
                   FROM
                   follower AS f INNER JOIN user AS u2
                   ON f.follower_user_id = u2.user_id
                   WHERE
                   u2.username LIKE '${username}')
                   ORDER BY
                   dateTime DESC
                   LIMIT 4;
  `

  const result = await db.all(getUserFollowsTweet)
  response.send(result)
})

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserFollowingName = `
  SELECT
  user.name
  FROM
  user
  WHERE
  user.user_id IN (
    SELECT
    f.following_user_id
    FROM 
    follower AS f INNER JOIN user as u2 
    ON 
    f.follower_user_id = u2.user_id 
    WHERE 
    u2.username LIKE '${username}'
  )
  `

  const result = await db.all(getUserFollowingName)
  response.send(result)
})

app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserFollowersNames = `
  SELECT
  user.name 
  FROM
  user
  WHERE
  user_id IN (
    SELECT
    f.follower_user_id
    FROM
    follower AS f INNER JOIN user AS u2 
    ON 
    f.following_user_id = u2.user_id 
    WHERE
    u2.username LIKE '${username}'
  );
  `

  const result = await db.all(getUserFollowersNames)
  response.send(result)
})

app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params
  const getTweetOfUserFollows = `
  SELECT
  tweet,
  (SELECT COUNT(*) FROM like WHERE tweet_id = tweet.tweet_id) AS likes,
  (SELECT COUNT(*) FROM reply WHERE tweet_id = tweet.tweet_id) AS replies,
  date_time AS dateTime
  FROM
  tweet
  WHERE
  tweet_id = '${tweetId}'
  AND 
  user_id IN (
    SELECT
    f.following_user_id
    FROM
    follower as f INNER JOIN user as u ON 
    f.follower_user_id = u.user_id 
    WHERE 
    u.username LIKE '${username}'
  )
  `
  const result = await db.get(getTweetOfUserFollows)
  console.log(result)
  if (result === undefined || result.length === 0) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(result)
  }
})

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getUserNameWhoLikedTheTweet = `
    SELECT 
    user.username 
    FROM
    like NATURAL JOIN user 
    WHERE 
    like.tweet_id = '${tweetId}'
    AND 
    like.tweet_id IN ( 
      SELECT
      tweet_id
      FROM
      tweet 
      WHERE 
      user_id  IN ( 
        SELECT
        f.following_user_id 
        FROM
        follower as f INNER JOIN user as u 
        ON 
        f.follower_user_id = u.user_id 
        WHERE 
        u.username LIKE '${username}'
      )
    );
    `

    const result = await db.all(getUserNameWhoLikedTheTweet)
    console.log(result)
    if (result === undefined || result.length === 0) {
      response.status(401).send('Invalid Request')
    } else {
      let likes = [...result]
      response.status(200).send(likes)
    }
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getWhoReplies = `
        SELECT
        u.username,
        r.reply AS reply 
        FROM
        reply AS r NATURAL JOIN user AS u 
        NATURAL JOIN tweet AS t
        WHERE
        t.tweet_id = '${tweetId}'
        AND 
        t.user_id IN (
          SELECT 
          f.following_user_id
          FROM
          follower as f JOIN user as u 
          ON
          f.follower_user_id = u.user_id 
          WHERE
          u.username LIKE '${username}'
        );

     `

    const result = await db.all(getWhoReplies)
    console.log(result)
    let replies = []
    const spreadingResult = () => {
      result.map(eachObj => replies.push(eachObj))
    }
    if (result === null || result.length === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      spreadingResult()
      response.send({
        replies,
      })
    }
  },
)

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserTweets = `
  SELECT 
  tweet,
  (SELECT COUNT(*) FROM like WHERE tweet_id = tweet.tweet_id) AS likes,
  (SELECT COUNT(*) FROM reply WHERE tweet_id = tweet.tweet_id) AS replies,
  date_time AS dateTime
  FROM
  tweet
  WHERE
  user_id = (
      SELECT
      user_id 
      FROM 
      user
      WHERE 
      user.username LIKE '${username}'
  );
  `
  const result = await db.all(getUserTweets)
  response.send(result)
})

app.post('/user/tweets/', authenticateToken, async (req, res) => {
  const {tweet} = req.body
  const createTweet = `
   INSERT INTO 
   tweet(tweet)
   VALUES('${tweet}')
  `
  await db.run(createTweet)
  res.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const checkTweet = `
     SELECT
     tweet 
     FROM
     tweet
     WHERE
     tweet_id = '${tweetId}'
     AND 
     user_id = (
      SELECT
      user_id
      FROM
      user
      WHERE
      user.username LIKE '${username}'
     );
  `
    const result = await db.get(checkTweet)
    if (result === undefined) {
      response.status(401).send('Invalid Request')
    } else {
      const deletingQuery = ` 
      DELETE FROM
      tweet
      WHERE 
      tweet_id = '${tweetId}';
      `
      await db.run(deletingQuery)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
