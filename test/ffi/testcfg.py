import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
import testpy

class FFITestConfiguration(testpy.ParallelTestConfiguration):
  def GetBuildRequirements(self):
    return ['build-ffi-tests']

def GetConfiguration(context, root):
  return FFITestConfiguration(context, root, 'ffi')
