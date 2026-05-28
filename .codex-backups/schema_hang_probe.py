import faulthandler, sys
faulthandler.dump_traceback_later(5, repeat=False)
print('before', flush=True)
from sqlalchemy.schema import CheckConstraint
print('after', CheckConstraint, flush=True)
