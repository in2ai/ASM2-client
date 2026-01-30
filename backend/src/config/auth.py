# Fake for now

USER_ID = 'user in2ai'
USER_ROLE = 'admin in2ai'

def authenticate(user_id, user_role):
    global USER_ID, USER_ROLE

    USER_ID = user_id
    USER_ROLE = user_role